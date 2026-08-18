/**
 * Meta WhatsApp Business Platform (Cloud API) Notification Service
 * 
 * Implements Meta Cloud API messaging:
 * POST https://graph.facebook.com/v21.0/{PHONE_NUMBER_ID}/messages
 */

const https = require('https');

/**
 * Format phone number to international E.164 format without leading '+'
 * Default country code is set to 256 (Uganda) if phone starts with local 0
 */
function formatPhoneNumber(phone, defaultCountryCode = '256') {
  if (!phone) return null;
  let cleaned = String(phone).replace(/[^\d+]/g, '').trim();
  if (cleaned.startsWith('+')) {
    cleaned = cleaned.substring(1);
  } else if (cleaned.startsWith('0')) {
    cleaned = defaultCountryCode + cleaned.substring(1);
  }
  return cleaned;
}

/**
 * Send WhatsApp notification using Meta WhatsApp Cloud API
 */
async function sendWhatsAppNotification({
  to,
  studentName,
  gradeClass,
  timeString,
  type, // 'ClockIn' or 'ClockOut'
  schoolName = 'St. Paul Senior Secondary School'
}) {
  const token = process.env.META_WHATSAPP_TOKEN;
  const phoneNumberId = process.env.META_WHATSAPP_PHONE_NUMBER_ID;
  const defaultCountryCode = process.env.META_WHATSAPP_DEFAULT_COUNTRY_CODE || '256';
  const enabled = process.env.META_WHATSAPP_ENABLED !== 'false';

  const recipient = formatPhoneNumber(to, defaultCountryCode);
  if (!recipient) {
    return {
      success: false,
      error: 'Invalid or missing recipient phone number',
      channel: 'WhatsApp'
    };
  }

  // Construct message content exactly per specification
  let messageBody = '';
  let statusText = type === 'ClockIn' ? 'Checked In' : 'Checked Out';

  if (type === 'ClockIn') {
    messageBody = `Dear Parent, Your child ${studentName} (${gradeClass || 'Student'}) has successfully arrived at ${schoolName} today at ${timeString}. Status: ${statusText}. Thank you.`;
  } else {
    messageBody = `Dear Parent, Your child ${studentName} (${gradeClass || 'Student'}) has departed from ${schoolName} today at ${timeString}. Status: ${statusText}. Thank you.`;
  }

  // If WhatsApp notifications disabled or credentials not provided, log and simulate
  if (!enabled || !token || !phoneNumberId || token.includes('your_meta_')) {
    console.log(`[Meta WhatsApp Service] [DEVELOPMENT / SIMULATED DISPATCH]`);
    console.log(`  To: ${recipient}`);
    console.log(`  Message: "${messageBody}"`);
    console.log(`  Note: Meta credentials not set or test mode active. Notification recorded successfully.`);
    return {
      success: true,
      simulated: true,
      messageId: `simulated-${Date.now()}`,
      message: messageBody,
      channel: 'WhatsApp'
    };
  }

  const templateName = process.env.META_WHATSAPP_TEMPLATE_NAME;
  let payloadObject = {};

  if (templateName) {
    payloadObject = {
      messaging_product: 'whatsapp',
      to: recipient,
      type: 'template',
      template: {
        name: templateName,
        language: { code: process.env.META_WHATSAPP_TEMPLATE_LANG || 'en_US' }
      }
    };
  } else {
    payloadObject = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: recipient,
      type: 'text',
      text: {
        preview_url: false,
        body: messageBody
      }
    };
  }

  const payload = JSON.stringify(payloadObject);

  return new Promise((resolve) => {
    const options = {
      hostname: 'graph.facebook.com',
      port: 443,
      path: `/v21.0/${phoneNumberId}/messages`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          if (res.statusCode >= 200 && res.statusCode < 300 && json.messages && json.messages[0]) {
            console.log(`[Meta WhatsApp Service] ✅ Message sent to ${recipient} (WAMID: ${json.messages[0].id})`);
            resolve({
              success: true,
              messageId: json.messages[0].id,
              message: messageBody,
              channel: 'WhatsApp'
            });
          } else {
            const errMsg = json.error ? json.error.message : `HTTP ${res.statusCode}: ${body}`;
            console.error(`[Meta WhatsApp Service] ❌ Failed to send to ${recipient}:`, errMsg);
            resolve({
              success: false,
              error: errMsg,
              message: messageBody,
              channel: 'WhatsApp'
            });
          }
        } catch (e) {
          console.error(`[Meta WhatsApp Service] ❌ Response parsing error:`, e.message);
          resolve({
            success: false,
            error: `Response parse error: ${e.message}`,
            message: messageBody,
            channel: 'WhatsApp'
          });
        }
      });
    });

    req.on('error', (err) => {
      console.error(`[Meta WhatsApp Service] ❌ Network request error:`, err.message);
      resolve({
        success: false,
        error: `Network error: ${err.message}`,
        message: messageBody,
        channel: 'WhatsApp'
      });
    });

    // Timeout protection after 10 seconds
    req.setTimeout(10000, () => {
      req.destroy();
      console.error(`[Meta WhatsApp Service] ❌ Request timed out for ${recipient}`);
      resolve({
        success: false,
        error: 'Meta API request timed out (10s)',
        message: messageBody,
        channel: 'WhatsApp'
      });
    });

    req.write(payload);
    req.end();
  });
}

module.exports = {
  formatPhoneNumber,
  sendWhatsAppNotification
};
