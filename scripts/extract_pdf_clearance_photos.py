import fitz  # PyMuPDF
import mysql.connector
import base64
import io
import os
import sys
import re
import json
import urllib.request
from PIL import Image

# Database connection parameters
DB_CONFIG = {
    'host': 'localhost',
    'port': 3306,
    'user': 'root',
    'password': 'root123',
    'database': 'student_clearance'
}

LIVE_BACKEND_URL = 'https://students-clearance-system.onrender.com/api/students'

def sync_to_live(student_data):
    try:
        req = urllib.request.Request(
            LIVE_BACKEND_URL,
            data=json.dumps(student_data).encode('utf-8'),
            headers={'Content-Type': 'application/json'},
            method='POST'
        )
        with urllib.request.urlopen(req, timeout=12) as response:
            return response.status in (200, 201)
    except Exception as e:
        print(f"  └ Live sync notice: {e}")
        return False

def is_green_placeholder(pil_img):
    # Sample center pixels of image to check if it's solid green
    w, h = pil_img.size
    colors = []
    for cx in range(int(w * 0.3), int(w * 0.7), max(1, int(w * 0.1))):
        for cy in range(int(h * 0.3), int(h * 0.7), max(1, int(h * 0.1))):
            pixel = pil_img.getpixel((cx, cy))
            if isinstance(pixel, tuple):
                r, g, b = pixel[:3]
                colors.append((r, g, b))
    
    if not colors:
        return False
        
    green_dominant_count = 0
    for r, g, b in colors:
        # Check green hue dominance e.g. green > red + 30 and green > blue + 30
        if g > r + 30 and g > b + 30:
            green_dominant_count += 1
            
    # If over 70% of sampled pixels are bright green, it's a placeholder
    return (green_dominant_count / len(colors)) > 0.70

def process_pdf(pdf_path):
    print(f"\n=======================================================")
    print(f"📸 PROCESSING CLEARANCE CARDS: {os.path.basename(pdf_path)}")
    print(f"=======================================================")
    
    if not os.path.exists(pdf_path):
        print(f"Error: File not found at {pdf_path}")
        return

    doc = fitz.open(pdf_path)
    print(f"Total pages in document: {len(doc)}")

    conn = mysql.connector.connect(**DB_CONFIG)
    cursor = conn.cursor(dictionary=True)

    updated_count = 0
    skipped_count = 0
    not_found_count = 0
    live_synced_count = 0

    for page_idx in range(len(doc)):
        page = doc[page_idx]
        text = page.get_text()
        
        if "STUDENT CLEARANCE CARD" not in text:
            continue

        pw, ph = page.rect.width, page.rect.height

        # Render high-res page pixmap (300 DPI)
        pix = page.get_pixmap(dpi=300)
        img_bytes = pix.tobytes("png")
        page_img = Image.open(io.BytesIO(img_bytes))
        iw, ih = page_img.size

        blocks = page.get_text("blocks")

        for i, b in enumerate(blocks):
            b_text = b[4].strip()
            if "STUDENT CLEARANCE CARD" in b_text:
                # The text blocks immediately following contain NAME, CLASS, STATUS, GENDER
                following_text = ""
                for j in range(1, 6):
                    if i + j < len(blocks):
                        following_text += " " + blocks[i + j][4].strip()

                name_match = re.search(r'NAME\s*:?\s*([A-Za-z0-9\s]+)', following_text, re.IGNORECASE)
                class_match = re.search(r'CLASS\s*:?\s*([A-Za-z0-9\.\s]+)', following_text, re.IGNORECASE)

                student_name = name_match.group(1).strip() if name_match else ""
                student_class = class_match.group(1).strip() if class_match else ""

                # Stop if class string Bleeds into STATUS
                if "STATUS" in student_class:
                    student_class = student_class.split("STATUS")[0].strip()

                if not student_name:
                    continue

                if "DIAGNOSTIC" in student_name.upper():
                    print(f"⏭️ Skipping placeholder card: {student_name}")
                    skipped_count += 1
                    continue

                # Precise crop coordinates for card photo box on the left of header
                # Header block y: b[1] to b[3]
                y0_pt = max(0, b[1] - 15)
                y1_pt = min(ph, b[1] + 165)
                x0_pt = pw * 0.535
                x1_pt = pw * 0.685

                crop_box = (
                    int((x0_pt / pw) * iw),
                    int((y0_pt / ph) * ih),
                    int((x1_pt / pw) * iw),
                    int((y1_pt / ph) * ih)
                )

                cropped_photo = page_img.crop(crop_box)

                # Skip if green placeholder image
                if is_green_placeholder(cropped_photo):
                    print(f"⏭️ Skipping green placeholder photo for: {student_name}")
                    skipped_count += 1
                    continue

                # Convert cropped photo to Base64 JPEG
                buffered = io.BytesIO()
                cropped_photo.save(buffered, format="JPEG", quality=90)
                img_b64 = "data:image/jpeg;base64," + base64.b64encode(buffered.getvalue()).decode('utf-8')

                # Search database by Student Name & Class
                clean_name = re.sub(r'\s+\d+$', '', student_name).strip()
                name_parts = clean_name.split()
                first_w = name_parts[0] if name_parts else clean_name
                last_w = name_parts[-1] if len(name_parts) > 1 else clean_name

                cursor.execute(
                    "SELECT id, adminNo, name, gradeClass FROM students WHERE LOWER(name) LIKE LOWER(%s) OR (LOWER(name) LIKE LOWER(%s) AND LOWER(name) LIKE LOWER(%s))",
                    (f"%{clean_name}%", f"%{first_w}%", f"%{last_w}%")
                )
                matches = cursor.fetchall()

                if matches:
                    target_student = matches[0]
                    if len(matches) > 1 and student_class:
                        for m in matches:
                            if student_class.lower() in m['gradeClass'].lower():
                                target_student = m
                                break

                    s_id = target_student['id']
                    cursor.execute(
                        "UPDATE students SET photo = %s, photoOriginal = %s, has_photo = 1 WHERE id = %s",
                        (img_b64, img_b64, s_id)
                    )
                    conn.commit()
                    updated_count += 1

                    # Sync live to Vercel / Cloud Backend
                    live_payload = {
                        "id": s_id,
                        "adminNo": target_student.get('adminNo', s_id),
                        "name": target_student['name'],
                        "gradeClass": target_student['gradeClass'],
                        "photo": img_b64,
                        "has_photo": 1
                    }

                    synced_live = sync_to_live(live_payload)
                    if synced_live:
                        live_synced_count += 1
                        print(f"✅ UPDATED & SYNCED LIVE: '{target_student['name']}' [{target_student['gradeClass']}] ➔ https://stpaulss-eportal.vercel.app")
                    else:
                        print(f"✅ UPDATED LOCALLY: '{target_student['name']}' [{target_student['gradeClass']}]")
                else:
                    print(f"❌ NOT FOUND IN DB: '{student_name}' ({student_class})")
                    not_found_count += 1

    cursor.close()
    conn.close()

    print(f"\n--- PAGE SUMMARY FOR {os.path.basename(pdf_path)} ---")
    print(f"Updated Local DB: {updated_count}")
    print(f"Synced Live Vercel: {live_synced_count}")
    print(f"Skipped Placeholders: {skipped_count}")
    print(f"Not Found: {not_found_count}\n")

if __name__ == "__main__":
    if len(sys.argv) > 1:
        process_pdf(sys.argv[1])
    else:
        print("Usage: python scripts/extract_pdf_clearance_photos.py <path_to_pdf>")
