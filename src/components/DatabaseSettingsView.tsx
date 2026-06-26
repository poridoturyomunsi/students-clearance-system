/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  Database,
  Server,
  Globe,
  Wifi,
  WifiOff,
  CheckCircle2,
  AlertCircle,
  Loader,
  Eye,
  EyeOff,
  RefreshCw,
  Settings,
} from 'lucide-react';
import {
  fetchDatabaseConfig,
  saveDatabaseConfig,
  testDatabaseConnection,
  fetchDatabaseStatus,
  setApiBaseUrl,
  getApiBaseUrl,
} from '../utils/api.ts';
import { DatabaseConfig, DatabaseConnectionStatus } from '../types.ts';

interface DatabaseSettingsViewProps {
  onClose?: () => void;
  onConfigSaved?: () => void;
}

export default function DatabaseSettingsView({
  onClose,
  onConfigSaved
}: DatabaseSettingsViewProps) {
  const isCloudProduction = typeof window !== 'undefined' && !(window as any).electron;
  const [config, setConfig] = useState<Partial<DatabaseConfig & { mode: string }>>({
    mode: 'network',
    serverIp: '',
    serverPort: 3000,
    databaseHost: '',
    databasePort: 3306,
    databaseName: '',
    databaseUsername: '',
    databasePassword: '',
  });

  const [status, setStatus] = useState<Partial<DatabaseConnectionStatus>>({
    connected: false,
    lastSuccessfulConnection: null,
    connectionMode: 'offline',
    errorMessage: null,
  });

  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [autoReconnectEnabled, setAutoReconnectEnabled] = useState(false);
  const reconnectIntervalRef = React.useRef<NodeJS.Timeout | null>(null);

  // Load current configuration and status on component mount
  useEffect(() => {
    const loadConfig = async () => {
      try {
        let loadedConfig: any = null;
        if (typeof window !== 'undefined' && (window as any).electron?.getDbConfig) {
          try {
            loadedConfig = await (window as any).electron.getDbConfig();
          } catch (e) {
            console.warn('Electron getDbConfig failed:', e);
          }
        }

        if (loadedConfig) {
          setConfig({
            mode: loadedConfig.mode || 'network',
            serverIp: loadedConfig.serverIp || '',
            serverPort: loadedConfig.serverPort || 3000,
            databaseHost: loadedConfig.db?.host || '',
            databasePort: loadedConfig.db?.port || 3306,
            databaseName: loadedConfig.db?.database || '',
            databaseUsername: loadedConfig.db?.user || '',
            databasePassword: loadedConfig.db?.password || '',
          });
        } else {
          const configResult = await fetchDatabaseConfig();
          if (configResult.config) {
            setConfig(configResult.config);
          }
        }

        try {
          const statusResult = await fetchDatabaseStatus();
          setStatus(statusResult);
        } catch (statusErr) {
          console.warn('Could not load connection status:', statusErr);
        }
      } catch (err) {
        console.warn('Could not load database configuration:', err);
      }
    };

    loadConfig();
  }, []);

  // Auto-reconnect functionality
  useEffect(() => {
    if (!autoReconnectEnabled) {
      if (reconnectIntervalRef.current) {
        clearInterval(reconnectIntervalRef.current);
        reconnectIntervalRef.current = null;
      }
      return;
    }

    const attemptReconnect = async () => {
      if (status.connected) {
        return; // Already connected, stop retrying
      }

      try {
        if (config.mode === 'client') {
          const testUrl = `http://${config.serverIp}:${config.serverPort || 3000}`;
          let clientConnected = false;
          if (typeof window !== 'undefined' && (window as any).electron?.testApiConnection) {
            const res = await (window as any).electron.testApiConnection(testUrl);
            clientConnected = res.success;
          } else {
            const response = await fetch(`${testUrl}/api/config-status`);
            clientConnected = response.ok;
          }

          if (clientConnected) {
            setStatus(prev => ({
              ...prev,
              connected: true,
              lastSuccessfulConnection: new Date().toISOString(),
              errorMessage: null,
            }));
            setSuccessMsg('Auto-reconnect successful! Server is now connected.');
          }
        } else {
          let dbConnected = false;
          const dbPayload = {
            host: config.databaseHost || '',
            port: config.databasePort || 3306,
            database: config.databaseName || '',
            user: config.databaseUsername || '',
            password: config.databasePassword || '',
          };

          if (typeof window !== 'undefined' && (window as any).electron?.testDbConnection) {
            const testResult = await (window as any).electron.testDbConnection(dbPayload);
            dbConnected = testResult.success;
          } else {
            const testResult = await testDatabaseConnection({
              databaseHost: config.databaseHost || '',
              databasePort: config.databasePort || 3306,
              databaseName: config.databaseName || '',
              databaseUsername: config.databaseUsername || '',
              databasePassword: config.databasePassword || '',
            });
            dbConnected = testResult.success;
          }

          if (dbConnected) {
            setStatus(prev => ({
              ...prev,
              connected: true,
              lastSuccessfulConnection: new Date().toISOString(),
              errorMessage: null,
            }));
            setSuccessMsg('Auto-reconnect successful! Database is now connected.');
          }
        }
      } catch (err) {
        console.warn('Auto-reconnect attempt failed:', err);
      }
    };

    // Attempt reconnection every 5 seconds
    reconnectIntervalRef.current = setInterval(attemptReconnect, 5000);

    return () => {
      if (reconnectIntervalRef.current) {
        clearInterval(reconnectIntervalRef.current);
      }
    };
  }, [autoReconnectEnabled, status.connected, config]);

  const handleConfigChange = (field: keyof DatabaseConfig | 'mode', value: any) => {
    setConfig(prev => ({
      ...prev,
      [field]: typeof value === 'string' && field.includes('Port') ? parseInt(value, 10) || 0 : value
    }));
  };

  const handleTestConnection = async () => {
    if (config.mode === 'client') {
      if (!config.serverIp) {
        setErrorMsg('Please fill in Server IP Address.');
        return;
      }
    } else {
      if (!config.databaseHost || !config.databaseName || !config.databaseUsername) {
        setErrorMsg('Please fill in Database Host, Database Name, and Database Username.');
        return;
      }
    }

    setTesting(true);
    setSuccessMsg(null);
    setErrorMsg(null);

    const testUrl = `http://${config.serverIp}:${config.serverPort || 3000}`;
    const dbConfigPayload = {
      host: config.databaseHost || '',
      port: config.databasePort || 3306,
      database: config.databaseName || '',
      user: config.databaseUsername || '',
      password: config.databasePassword || '',
    };

    try {
      let success = false;
      let error = '';

      if (config.mode === 'client') {
        if (typeof window !== 'undefined' && (window as any).electron?.testApiConnection) {
          const res = await (window as any).electron.testApiConnection(testUrl);
          success = res.success;
          error = res.error || 'Could not connect to API server.';
        } else {
          const response = await fetch(`${testUrl}/api/config-status`);
          if (response.ok) {
            success = true;
          } else {
            error = `Server returned status code ${response.status}`;
          }
        }
      } else {
        if (typeof window !== 'undefined' && (window as any).electron?.testDbConnection) {
          const res = await (window as any).electron.testDbConnection(dbConfigPayload);
          success = res.success;
          error = res.error || '';
        } else {
          const res = await testDatabaseConnection({
            databaseHost: config.databaseHost || '',
            databasePort: config.databasePort || 3306,
            databaseName: config.databaseName || '',
            databaseUsername: config.databaseUsername || '',
            databasePassword: config.databasePassword || '',
          });
          success = res.success;
          error = res.error || '';
        }
      }

      if (success) {
        setSuccessMsg(config.mode === 'client' ? '✓ API Server connection successful!' : '✓ Database connection successful!');
        setStatus(prev => ({
          ...prev,
          connected: true,
          lastSuccessfulConnection: new Date().toISOString(),
          errorMessage: null,
        }));
      } else {
        const mappedError = error.toLowerCase().includes('access denied') || error.toLowerCase().includes('using password')
          ? 'Invalid MySQL credentials'
          : `Connection failed: ${error}`;
        setErrorMsg(mappedError);
        setStatus(prev => ({
          ...prev,
          connected: false,
          errorMessage: mappedError,
        }));
      }
    } catch (err: any) {
      const errorText = err.message || 'Connection test failed.';
      setErrorMsg(errorText);
      setStatus(prev => ({
        ...prev,
        connected: false,
        errorMessage: errorText,
      }));
    } finally {
      setTesting(false);
    }
  };

  const handleSaveConfiguration = async () => {
    if (config.mode !== 'client') {
      if (!config.databaseHost || !config.databaseName || !config.databaseUsername) {
        setErrorMsg('Please fill in Database Host, Database Name, and Database Username.');
        return;
      }
    } else {
      if (!config.serverIp) {
        setErrorMsg('Please fill in Server IP Address.');
        return;
      }
    }

    setLoading(true);
    setSuccessMsg(null);
    setErrorMsg(null);

    const payload = {
      mode: config.mode || 'network',
      serverIp: config.serverIp || '192.168.0.155',
      serverPort: config.serverPort || 3000,
      databaseHost: config.databaseHost || '',
      databasePort: config.databasePort || 3306,
      databaseName: config.databaseName || '',
      databaseUsername: config.databaseUsername || '',
      databasePassword: config.databasePassword || '',
    };

    try {
      let success = false;
      let error = '';

      if (typeof window !== 'undefined' && (window as any).electron?.saveDbConfig) {
        const electronPayload = {
          mode: payload.mode,
          serverUrl: `http://${payload.serverIp}:${payload.serverPort}`,
          db: {
            host: payload.databaseHost,
            port: payload.databasePort,
            database: payload.databaseName,
            user: payload.databaseUsername,
            password: payload.databasePassword,
          }
        };
        success = await (window as any).electron.saveDbConfig(electronPayload);
        if (!success) {
          error = 'Failed to save configuration via Electron.';
        }
      } else {
        const result = await saveDatabaseConfig(payload);
        success = result.success;
        error = result.error || 'Failed to save configuration.';
      }

      if (success) {
        const newServerUrl = `http://${payload.serverIp}:${payload.serverPort}`;
        setApiBaseUrl(newServerUrl);

        setSuccessMsg('✓ Database configuration saved successfully!');
        setStatus(prev => ({
          ...prev,
          connectionMode: payload.mode,
        }));

        if (onConfigSaved) {
          onConfigSaved();
        }

        setTimeout(() => {
          if (onClose) {
            onClose();
          }
        }, 2000);
      } else {
        setErrorMsg(error);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save configuration.');
    } finally {
      setLoading(false);
    }
  };

  const handleRefreshStatus = async () => {
    try {
      const result = await fetchDatabaseStatus();
      setStatus(result);
    } catch (err) {
      console.warn('Could not refresh status:', err);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Page Header */}
      <div>
        <h2 className="text-lg font-black uppercase tracking-wider text-slate-200 flex items-center gap-2">
          <Database className="w-5 h-5 text-cyan-400" />
          Database Configuration
        </h2>
        <p className="text-[10px] text-slate-500 mt-0.5">
          Configure network database connection settings for centralized data management
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Connection Status Card */}
        <div className="lg:col-span-1 bg-slate-950 border border-slate-850 p-6 rounded-2xl shadow-lg flex flex-col">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-cyan-500 to-blue-500" style={{ position: 'relative' }} />
          
          <h3 className="text-xs font-black uppercase text-slate-300 tracking-wider mb-4 flex items-center gap-2">
            <Wifi className="w-4 h-4 text-cyan-400" /> Connection Status
          </h3>

          <div className="space-y-3 flex-1">
            {/* Status Indicator */}
            <div className="flex items-center gap-3 p-3 bg-slate-900/60 rounded-lg border border-slate-800">
              {status.connected ? (
                <>
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                  <div>
                    <div className="text-xs font-bold text-emerald-400">Connected</div>
                    <div className="text-[9px] text-slate-400">Database is online</div>
                  </div>
                </>
              ) : (
                <>
                  <WifiOff className="w-5 h-5 text-rose-400 shrink-0" />
                  <div>
                    <div className="text-xs font-bold text-rose-400">Disconnected</div>
                    <div className="text-[9px] text-slate-400">Database is offline</div>
                  </div>
                </>
              )}
            </div>
            {/* Mode Indicator */}
            <div className="text-[9px] text-slate-500 space-y-1">
              <div className="flex justify-between">
                <span>Mode:</span>
                <span className="text-slate-300 font-semibold">
                  {status.connectionMode === 'network' || status.connectionMode === 'host'
                    ? 'Network (Host)'
                    : status.connectionMode === 'client'
                    ? 'Network (Client)'
                    : 'Offline'}
                </span>
              </div>
            </div>

            {/* Last Connection Time */}
            {status.lastSuccessfulConnection && (
              <div className="pt-3 border-t border-slate-850">
                <div className="text-[9px] text-slate-505 mb-1">Last Connected:</div>
                <div className="text-[9px] text-slate-300 font-mono">
                  {new Date(status.lastSuccessfulConnection).toLocaleString()}
                </div>
              </div>
            )}

            {/* Error Message */}
            {status.errorMessage && (
              <div className="mt-3 p-2 bg-rose-955/40 border border-rose-900/30 rounded text-[9px] text-rose-400">
                {status.errorMessage}
              </div>
            )}
          </div>

          {/* Refresh Button */}
          <button
            onClick={handleRefreshStatus}
            className="w-full mt-4 py-2 bg-slate-900 border border-slate-800 hover:border-cyan-600 text-cyan-400 text-xs font-bold uppercase rounded-lg flex items-center justify-center gap-1.5 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh Status
          </button>
        </div>

        {/* Configuration Form */}
        <div className="lg:col-span-2 bg-slate-950 border border-slate-850 p-6 rounded-2xl shadow-lg space-y-4">
          {isCloudProduction && (
            <div className="bg-amber-500/10 border border-amber-500/20 p-3.5 rounded-xl flex items-start gap-2.5 text-xs text-amber-400 font-medium">
              <AlertCircle className="w-4.5 h-4.5 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold mb-0.5">Cloud Production Mode Active</div>
                <div>Connection configurations are locked to the environment settings configured on your backend cloud host. Setting inputs are disabled.</div>
              </div>
            </div>
          )}

          <h3 className="text-xs font-black uppercase text-slate-300 tracking-wider flex items-center gap-1.5">
            <Settings className="w-4 h-4 text-cyan-400" /> Operational Mode
          </h3>

          {isCloudProduction ? (
            <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg text-xs font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
              <Globe className="w-4 h-4" /> Cloud Production Database (Active)
            </div>
          ) : (
            <div className="flex flex-col gap-1.5 mb-4">
              <div className="grid grid-cols-2 gap-2 p-1 bg-slate-900 rounded-lg border border-slate-800">
                <button
                  type="button"
                  onClick={() => setConfig(prev => ({ ...prev, mode: 'network' }))}
                  className={`py-2 rounded-md text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    config.mode === 'network' || config.mode === 'host'
                      ? 'bg-cyan-600 text-slate-950 shadow'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Server className="w-3.5 h-3.5" />
                  Network DB (Host)
                </button>
                <button
                  type="button"
                  onClick={() => setConfig(prev => ({ ...prev, mode: 'client' }))}
                  className={`py-2 rounded-md text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    config.mode === 'client'
                      ? 'bg-cyan-600 text-slate-950 shadow'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Wifi className="w-3.5 h-3.5" />
                  Network Client (Device)
                </button>
              </div>
              <p className="text-[9.5px] text-slate-500 leading-normal mt-0.5 font-medium">
                {config.mode === 'network' || config.mode === 'host'
                  ? 'Network Database Mode (Server/Host) runs the local API server and connects directly to the shared network MySQL database server. Other PCs can connect to this machine.'
                  : 'Network Client Mode (Client Device) connects to an existing Host API server URL running on another computer in the network.'}
              </p>
            </div>
          )}

          {!isCloudProduction && (
            <>
              <hr className="border-slate-800 my-2" />

              <h3 className="text-xs font-black uppercase text-slate-300 tracking-wider flex items-center gap-1.5">
                <Globe className="w-4 h-4 text-cyan-400" /> Network Settings
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">
                    Server IP Address
                  </label>
                  <input
                    type="text"
                    disabled={isCloudProduction}
                    value={config.serverIp || ''}
                    onChange={(e) => handleConfigChange('serverIp', e.target.value)}
                    placeholder="e.g. 192.168.0.155"
                    className="bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-medium disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                  <p className="text-[8px] text-slate-500 mt-0.5">Computer IP hosting the system</p>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">
                    Server Port
                  </label>
                  <input
                    type="number"
                    disabled={isCloudProduction}
                    value={config.serverPort || 3000}
                    onChange={(e) => handleConfigChange('serverPort', e.target.value)}
                    placeholder="3000"
                    className="bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-medium disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                  <p className="text-[8px] text-slate-500 mt-0.5">Application server port</p>
                </div>
              </div>
            </>
          )}

          {(config.mode === 'network' || config.mode === 'host' || isCloudProduction) && (
            <>
              <hr className="border-slate-800 my-2" />

              <h3 className="text-xs font-black uppercase text-slate-300 tracking-wider flex items-center gap-1.5 mt-4">
                <Server className="w-4 h-4 text-cyan-400" /> Database Settings
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[9px] text-slate-505 font-bold uppercase tracking-wider">
                    Database Host <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    disabled={isCloudProduction}
                    value={config.databaseHost || ''}
                    onChange={(e) => handleConfigChange('databaseHost', e.target.value)}
                    placeholder="e.g. 192.168.0.155"
                    className="bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-medium disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[9px] text-slate-505 font-bold uppercase tracking-wider">
                    Database Port
                  </label>
                  <input
                    type="number"
                    disabled={isCloudProduction}
                    value={config.databasePort || 3306}
                    onChange={(e) => handleConfigChange('databasePort', e.target.value)}
                    placeholder="3306"
                    className="bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-medium disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[9px] text-slate-505 font-bold uppercase tracking-wider">
                    Database Name <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    disabled={isCloudProduction}
                    value={config.databaseName || ''}
                    onChange={(e) => handleConfigChange('databaseName', e.target.value)}
                    placeholder="e.g. students_db"
                    className="bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-medium disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[9px] text-slate-505 font-bold uppercase tracking-wider">
                    Database Username <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    disabled={isCloudProduction}
                    value={config.databaseUsername || ''}
                    onChange={(e) => handleConfigChange('databaseUsername', e.target.value)}
                    placeholder="e.g. root"
                    className="bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-medium disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                </div>

                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <label className="text-[9px] text-slate-505 font-bold uppercase tracking-wider">
                    Database Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      disabled={isCloudProduction}
                      value={config.databasePassword || ''}
                      onChange={(e) => handleConfigChange('databasePassword', e.target.value)}
                      placeholder="••••••••••••"
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 pr-10 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-medium disabled:opacity-60 disabled:cursor-not-allowed"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-500 hover:text-slate-350 transition-colors"
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Messages */}
          {successMsg && (
            <div className="bg-emerald-500/10 border border-emerald-550/20 p-3.5 rounded-xl flex items-center gap-2.5 text-xs text-emerald-400 font-semibold animate-pulse">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {errorMsg && (
            <div className="bg-rose-500/10 border border-rose-550/20 p-3.5 rounded-xl flex items-center gap-2.5 text-xs text-rose-400 font-semibold">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Auto-Reconnect Toggle */}
          <div className="flex items-center gap-3 p-3 bg-slate-900/40 border border-slate-800 rounded-lg mt-4">
            <input
              type="checkbox"
              id="autoReconnect"
              checked={autoReconnectEnabled}
              onChange={(e) => setAutoReconnectEnabled(e.target.checked)}
              className="w-4 h-4 rounded cursor-pointer"
            />
            <label htmlFor="autoReconnect" className="text-xs text-slate-300 font-semibold cursor-pointer flex-1">
              Enable Auto-Reconnect
            </label>
            <span className="text-[8px] text-slate-500">
              {autoReconnectEnabled ? 'Enabled' : 'Disabled'}
            </span>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 pt-4">
            <button
              onClick={handleTestConnection}
              disabled={testing || loading}
              className="w-full sm:flex-1 py-2.5 bg-slate-900 border border-slate-800 hover:bg-slate-850 hover:border-cyan-600 text-cyan-400 text-xs font-bold uppercase rounded-lg flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {testing ? (
                <>
                  <Loader className="w-4 h-4 animate-spin" />
                  Testing...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Test Connection
                </>
              )}
            </button>

            <button
              onClick={handleSaveConfiguration}
              disabled={loading || testing || isCloudProduction}
              className="w-full sm:flex-1 py-2.5 bg-cyan-600 hover:bg-cyan-700 border border-cyan-600 text-slate-950 text-xs font-bold uppercase rounded-lg flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Save Configuration
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Additional Info */}
      <div className="bg-slate-950/50 border border-slate-850 p-4 rounded-lg">
        <p className="text-[9px] text-slate-400 leading-relaxed">
          <strong className="text-slate-300">Important:</strong> Once you configure a network database, the system will require a connection to this server to operate. The system will never create separate local offline databases. All data will be stored centrally on the configured database server.
        </p>
      </div>
    </div>
  );
}
