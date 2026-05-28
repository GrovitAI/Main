import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, FlatList, TextInput, ActivityIndicator, Switch, Platform } from 'react-native';
import { Printer as PrinterIcon, Plus, Trash2, Check, AlertCircle, Wifi, Settings, ChevronDown, ChevronUp } from 'lucide-react-native';
import { colors } from '@/lib/pos/brand';
import { fetchPrinters, savePrinter, deletePrinter, type Printer } from '@/lib/pos/printer-db-service';
import { printerService, diagnosePrinterConnection } from '@/lib/printer/printer-service';
import { MenuManagement } from '@/components/settings/MenuManagement';

type PrinterFormState = Omit<Printer, 'id' | 'tenant_id' | 'branch_id'> & { id?: string };

const initialFormState: PrinterFormState = {
  name: '',
  type: 'epson_thermal',
  connection: 'network',
  ip_address: '',
  port: 9100,
  paper_width: '80mm',
  printer_role: 'bill',
  is_default: false,
  is_active: true,
  os_printer_name: null,
};

export default function SettingsScreen() {
  const [activeTab, setActiveTab] = useState<'printers' | 'menu'>('printers');
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [selectedPrinter, setSelectedPrinter] = useState<Printer | null>(null);
  const [formState, setFormState] = useState<PrinterFormState>(initialFormState);
  const [isNew, setIsNew] = useState(true);

  // Advanced section collapse state
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Live connection status indicator state
  const [connStatus, setConnStatus] = useState<'connected' | 'unreachable' | 'offline' | 'missing' | 'checking'>('checking');

  // Load configured printers
  const loadPrinters = async () => {
    setLoading(true);
    setError(null);
    const res = await fetchPrinters();
    if (res.error) {
      setError(res.error);
    } else if (res.data) {
      setPrinters(res.data);
      if (res.data.length > 0 && !selectedPrinter) {
        handleSelectPrinter(res.data[0]);
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    loadPrinters();
  }, []);

  // Async connectivity checking
  const checkConnectivity = async (currentForm: PrinterFormState) => {
    setConnStatus('checking');
    try {
      const status = await diagnosePrinterConnection(currentForm);
      setConnStatus(status);
    } catch {
      setConnStatus('offline');
    }
  };

  // Check connectivity whenever critical values are edited
  useEffect(() => {
    checkConnectivity(formState);
  }, [formState.connection, formState.ip_address, formState.port, formState.name, formState.os_printer_name]);

  const handleSelectPrinter = (printer: Printer) => {
    setSelectedPrinter(printer);
    const selectedState = {
      id: printer.id,
      name: printer.name,
      type: printer.type,
      connection: printer.connection,
      ip_address: printer.ip_address ?? '',
      port: printer.port,
      paper_width: printer.paper_width,
      printer_role: printer.printer_role,
      is_default: printer.is_default,
      is_active: printer.is_active,
      os_printer_name: printer.os_printer_name ?? null,
    };
    setFormState(selectedState);
    setIsNew(false);
    setFormError(null);
    setSuccessMsg(null);
    setShowAdvanced(false);
    checkConnectivity(selectedState);
  };

  const handleStartNew = () => {
    setSelectedPrinter(null);
    setFormState({ ...initialFormState });
    setIsNew(true);
    setFormError(null);
    setSuccessMsg(null);
    setShowAdvanced(false);
    checkConnectivity(initialFormState);
  };

  const validateForm = (): boolean => {
    if (!formState.name.trim()) {
      setFormError('Printer name is required.');
      return false;
    }
    if (formState.connection === 'network') {
      if (!formState.ip_address?.trim()) {
        setFormError('IP Address is required for network connection.');
        return false;
      }
      const ipRegex = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/;
      if (!ipRegex.test(formState.ip_address.trim())) {
        setFormError('Please enter a valid IPv4 IP Address.');
        return false;
      }
    }
    if (!formState.port || formState.port <= 0) {
      setFormError('A valid port is required.');
      return false;
    }
    setFormError(null);
    return true;
  };

  const handleSave = async () => {
    if (!validateForm()) return;

    setSubmitting(true);
    setSuccessMsg(null);

    const printerPayload = {
      ...formState,
      ip_address: formState.connection === 'network' ? (formState.ip_address || '').trim() : null,
      port: Number(formState.port),
      os_printer_name: formState.os_printer_name,
    };

    // Note: If os_printer_name is missing, standard REST insert might return error until DDL runs.
    // We handle it gracefully by letting users know.
    const res = await savePrinter(printerPayload);
    setSubmitting(false);

    if (res.error) {
      if (res.error.toLowerCase().includes('column') || res.error.toLowerCase().includes('does not exist')) {
        setFormError('Database column missing. Please run the SQL migration inside your Supabase console:\n\nALTER TABLE printers ADD COLUMN os_printer_name text;');
      } else {
        setFormError(res.error);
      }
    } else if (res.data) {
      setSuccessMsg(`Printer "${res.data.name}" saved successfully!`);
      const updatedRes = await fetchPrinters();
      if (updatedRes.data) {
        setPrinters(updatedRes.data);
        const saved = updatedRes.data.find(p => p.name === printerPayload.name || p.id === printerPayload.id);
        if (saved) {
          handleSelectPrinter(saved);
        }
      }
    }
  };

  const handleDelete = async (id: string) => {
    if (!id) return;
    setLoading(true);
    const res = await deletePrinter(id);
    if (res.error) {
      setError(res.error);
    } else {
      handleStartNew();
      loadPrinters();
    }
  };

  const handleTestConnection = async () => {
    if (!validateForm()) return;

    setTesting(true);
    setFormError(null);
    setSuccessMsg(null);

    try {
      const testPrinterPayload = {
        ...formState,
        ip_address: formState.connection === 'network' ? (formState.ip_address || '').trim() : null,
        port: Number(formState.port),
      };

      // testPrinter resolves and returns the matched OS printer name!
      const resolvedSpooler = await printerService.testPrinter(testPrinterPayload);
      
      // Auto-populate the matched spooler into our form state so it is ready to save!
      setFormState(prev => ({
        ...prev,
        os_printer_name: resolvedSpooler
      }));

      setSuccessMsg('Printer connected successfully');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes('qz') || msg.toLowerCase().includes('websocket') || msg.toLowerCase().includes('offline')) {
        setFormError('Please start QZ Tray');
      } else if (msg.toLowerCase().includes('no epson') || msg.toLowerCase().includes('driver') || msg.toLowerCase().includes('spooler')) {
        setFormError('No Epson printer match found in local OS printers.');
      } else {
        setFormError(`Could not reach printer at ${formState.ip_address ?? 'LAN'}:${formState.port ?? 9100}`);
      }
    } finally {
      setTesting(false);
      checkConnectivity(formState);
    }
  };

  const renderStatusIndicator = () => {
    switch (connStatus) {
      case 'connected':
        return (
          <View className="flex-row items-center gap-2 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
            <View className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <Text className="text-emerald-700 text-xs font-bold">Connected</Text>
          </View>
        );
      case 'unreachable':
        return (
          <View className="flex-row items-center gap-2 bg-amber-50 px-3 py-1 rounded-full border border-amber-200">
            <View className="w-2 h-2 rounded-full bg-amber-500" />
            <Text className="text-amber-700 text-xs font-bold">Printer Unreachable</Text>
          </View>
        );
      case 'missing':
        return (
          <View className="flex-row items-center gap-2 bg-yellow-50 px-3 py-1 rounded-full border border-yellow-200">
            <View className="w-2 h-2 rounded-full bg-yellow-500" />
            <Text className="text-yellow-700 text-xs font-bold">Printer Missing (No Match)</Text>
          </View>
        );
      case 'offline':
        return (
          <View className="flex-row items-center gap-2 bg-rose-50 px-3 py-1 rounded-full border border-rose-200">
            <View className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
            <Text className="text-rose-700 text-xs font-bold">QZ Offline</Text>
          </View>
        );
      case 'checking':
      default:
        return (
          <View className="flex-row items-center gap-2 bg-slate-50 px-3 py-1 rounded-full border border-slate-200">
            <ActivityIndicator size="small" color={colors.primary} style={{ transform: [{ scale: 0.7 }] }} />
            <Text className="text-slate-600 text-xs font-bold">Checking...</Text>
          </View>
        );
    }
  };

  return (
    <View className="flex-1 bg-surface-tint p-3">
      {/* Slim Inline Unified Switcher Bar */}
      <View className="flex-row items-center justify-between bg-white border border-border p-2.5 rounded-2xl mb-3 shadow-xs flex-wrap gap-2">
        <View className="flex-row items-center gap-2">
          <Settings size={18} color={colors.primaryDeep} />
          <Text className="text-base font-black text-text-primary">System Settings</Text>
        </View>

        <View className="flex-row border border-border bg-slate-50 p-0.5 rounded-xl" style={{ height: 34, width: 340 }}>
          <Pressable
            onPress={() => setActiveTab('printers')}
            className={`flex-1 items-center justify-center rounded-lg transition-all ${
              activeTab === 'printers' ? 'bg-primary' : 'bg-transparent active:bg-slate-100'
            }`}
            style={{ height: 30 }}
          >
            <Text className={`font-extrabold text-[11px] ${activeTab === 'printers' ? 'text-white' : 'text-text-secondary'}`}>
              Printer Configuration
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setActiveTab('menu')}
            className={`flex-1 items-center justify-center rounded-lg transition-all ${
              activeTab === 'menu' ? 'bg-primary' : 'bg-transparent active:bg-slate-100'
            }`}
            style={{ height: 30 }}
          >
            <Text className={`font-extrabold text-[11px] ${activeTab === 'menu' ? 'text-white' : 'text-text-secondary'}`}>
              Menu Catalog Manager
            </Text>
          </Pressable>
        </View>
      </View>

      {activeTab === 'printers' ? (
        <>
          {/* Header section with brand colors */}
          <View className="mb-6 flex-row items-center justify-between border-b border-border p-4 bg-white rounded-2xl shadow-sm">
            <View className="flex-row items-center gap-3">
              <View className="p-3 bg-accentSoft rounded-xl">
                <PrinterIcon size={24} color={colors.primary} />
              </View>
              <View>
                <Text className="text-xl font-bold text-text-primary">Printer Configuration</Text>
                <Text className="text-sm text-text-secondary">Manage Epson LAN/IP thermal printer settings</Text>
              </View>
            </View>

            <Pressable
              className="flex-row items-center gap-2 px-5 py-3 rounded-xl bg-primary active:opacity-90"
              style={({ pressed }) => pressed && { opacity: 0.9 }}
              onPress={handleStartNew}
            >
              <Plus size={18} color="white" />
              <Text className="text-white font-semibold text-sm">Add Printer</Text>
            </Pressable>
          </View>

          {/* Main layout: responsive side-by-side or stacked grid */}
          <View className={`flex-1 ${Platform.OS === 'web' ? 'flex-row gap-6' : 'flex-col gap-6'}`}>
            
            {/* Left Side: Printers list */}
            <View className={`bg-white rounded-2xl p-5 border border-border shadow-sm ${Platform.OS === 'web' ? 'w-1/3' : 'w-full'}`}>
              <Text className="text-base font-bold text-text-primary mb-4">Configured Printers</Text>

              {loading ? (
                <View className="flex-1 items-center justify-center py-10">
                  <ActivityIndicator size="large" color={colors.primary} />
                </View>
              ) : error ? (
                <View className="items-center justify-center py-6 bg-red-50 rounded-xl p-4 border border-red-200">
                  <AlertCircle size={24} color="#dc2626" />
                  <Text className="text-red-700 text-center font-medium mt-2">{error}</Text>
                </View>
              ) : printers.length === 0 ? (
                <View className="flex-1 items-center justify-center py-12 px-4 border-2 border-dashed border-border rounded-2xl">
                  <PrinterIcon size={48} color={colors.textSecondary} className="opacity-40" />
                  <Text className="text-text-primary font-bold text-lg mt-4 text-center">No Printers Configured</Text>
                  <Text className="text-text-secondary text-sm text-center mt-2">
                    Click "Add Printer" to set up your Epson network/IP printer.
                  </Text>
                </View>
              ) : (
                <FlatList
                  data={printers}
                  keyExtractor={(item) => item.id}
                  showsVerticalScrollIndicator={false}
                  renderItem={({ item }) => {
                    const isSelected = selectedPrinter?.id === item.id;
                    return (
                      <Pressable
                        onPress={() => handleSelectPrinter(item)}
                        style={({ pressed }) => pressed && { opacity: 0.95 }}
                        className={`flex-row items-center justify-between p-4 mb-3 rounded-xl border transition-all ${
                          isSelected
                            ? 'bg-accentSoft border-primary'
                            : 'bg-white border-border active:bg-slate-50'
                        }`}
                      >
                        <View className="flex-1 mr-3">
                          <View className="flex-row items-center gap-2 flex-wrap">
                            <Text className="font-semibold text-text-primary text-base">{item.name}</Text>
                            {item.is_default && (
                              <View className="bg-primary px-2 py-0.5 rounded-md">
                                <Text className="text-white text-xs font-medium">Default</Text>
                              </View>
                            )}
                            {!item.is_active && (
                              <View className="bg-slate-200 px-2 py-0.5 rounded-md">
                                <Text className="text-slate-600 text-xs font-medium">Inactive</Text>
                              </View>
                            )}
                          </View>
                          
                          <View className="flex-row items-center gap-2 mt-2 flex-wrap">
                            <View className="flex-row items-center gap-1 bg-slate-100 px-2 py-0.5 rounded-md">
                              <Wifi size={12} color={colors.textSecondary} />
                              <Text className="text-text-secondary text-xs font-medium uppercase">
                                {item.connection}
                              </Text>
                            </View>

                            <Text className="text-text-secondary text-xs">
                              {item.printer_role === 'bill' ? 'Bill Printer' : 'Kitchen Printer'}
                            </Text>
                            
                            {item.ip_address && (
                              <Text className="text-text-secondary text-xs">• {item.ip_address}:{item.port}</Text>
                            )}
                          </View>
                        </View>
                        
                        <Pressable
                          style={({ pressed }) => pressed && { opacity: 0.8 }}
                          className="p-2 hover:bg-red-50 rounded-lg"
                          onPress={(e) => {
                            e.stopPropagation();
                            handleDelete(item.id);
                          }}
                        >
                          <Trash2 size={16} color="#dc2626" />
                        </Pressable>
                      </Pressable>
                    );
                  }}
                />
              )}
            </View>

            {/* Right Side: Configuration Detail / Form */}
            <View className="flex-1 bg-white rounded-2xl p-6 border border-border shadow-sm justify-between">
              <View>
                <View className="border-b border-border pb-3 mb-6 flex-row items-center justify-between">
                  <View className="flex-row items-center gap-2">
                    <Settings size={20} color={colors.primary} />
                    <Text className="text-lg font-bold text-text-primary">
                      {isNew ? 'New Printer Configuration' : 'Edit Printer Configuration'}
                    </Text>
                  </View>
                  {renderStatusIndicator()}
                </View>

                {formError && (
                  <View className="flex-row items-center gap-3 bg-red-50 p-4 border border-red-200 rounded-xl mb-6">
                    <AlertCircle size={20} color="#dc2626" />
                    <Text className="text-red-700 font-medium flex-1 text-sm">{formError}</Text>
                  </View>
                )}

                {successMsg && (
                  <View className="flex-row items-center gap-3 bg-green-50 p-4 border border-green-200 rounded-xl mb-6">
                    <Check size={20} color="#15803d" />
                    <Text className="text-green-700 font-medium flex-1 text-sm">{successMsg}</Text>
                  </View>
                )}

                {/* Inputs grid */}
                <View className="flex-row flex-wrap -mx-3">
                  {/* Printer Friendly Name */}
                  <View className="w-full md:w-1/2 px-3 mb-5">
                    <Text className="text-sm font-semibold text-text-primary mb-2">Printer Name (Display Label)</Text>
                    <TextInput
                      value={formState.name}
                      onChangeText={(text) => setFormState(prev => ({ ...prev, name: text }))}
                      placeholder="e.g. Cash Counter"
                      placeholderTextColor="#94a3b8"
                      className="border border-border rounded-xl px-4 py-3 text-text-primary bg-slate-50 focus:bg-white text-base"
                      style={{ minHeight: 44 }}
                    />
                  </View>

                  {/* Printer Type */}
                  <View className="w-full md:w-1/2 px-3 mb-5">
                    <Text className="text-sm font-semibold text-text-primary mb-2">Printer Type</Text>
                    <View className="border border-border rounded-xl bg-slate-50 overflow-hidden" style={{ minHeight: 44, justifyContent: 'center' }}>
                      <Text className="px-4 py-3 text-text-primary text-base font-medium">Epson Thermal</Text>
                    </View>
                  </View>

                  {/* Connection Type */}
                  <View className="w-full md:w-1/2 px-3 mb-5">
                    <Text className="text-sm font-semibold text-text-primary mb-2">Connection Type</Text>
                    <View className="flex-row gap-3">
                      {['network', 'usb'].map((conn) => {
                        const isSelected = formState.connection === conn;
                        return (
                          <Pressable
                            key={conn}
                            className={`flex-1 border rounded-xl items-center justify-center ${
                              isSelected ? 'bg-primary border-primary' : 'bg-slate-50 border-border active:bg-slate-100'
                            }`}
                            style={({ pressed }) => [
                              { height: 44, justifyContent: 'center', flex: 1 },
                              pressed && { opacity: 0.9 }
                            ]}
                            onPress={() => setFormState(prev => ({ ...prev, connection: conn }))}
                          >
                            <Text className={`font-semibold text-sm ${isSelected ? 'text-white' : 'text-text-secondary'}`}>
                              {conn === 'network' ? 'Network IP' : 'USB (Future)'}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>

                  {/* Paper Width */}
                  <View className="w-full md:w-1/2 px-3 mb-5">
                    <Text className="text-sm font-semibold text-text-primary mb-2">Paper Width</Text>
                    <View className="flex-row gap-3">
                      {['80mm', '58mm'].map((size) => {
                        const isSelected = formState.paper_width === size;
                        return (
                          <Pressable
                            key={size}
                            className={`flex-1 border rounded-xl items-center justify-center ${
                              isSelected ? 'bg-primary border-primary' : 'bg-slate-50 border-border active:bg-slate-100'
                            }`}
                            style={({ pressed }) => [
                              { height: 44, justifyContent: 'center', flex: 1 },
                              pressed && { opacity: 0.9 }
                            ]}
                            onPress={() => setFormState(prev => ({ ...prev, paper_width: size }))}
                          >
                            <Text className={`font-semibold text-sm ${isSelected ? 'text-white' : 'text-text-secondary'}`}>
                              {size}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>

                  {/* Conditional Network IP & Port */}
                  {formState.connection === 'network' && (
                    <>
                      <View className="w-full md:w-1/2 px-3 mb-5">
                        <Text className="text-sm font-semibold text-text-primary mb-2">IP Address</Text>
                        <TextInput
                          value={formState.ip_address ?? ''}
                          onChangeText={(text) => setFormState(prev => ({ ...prev, ip_address: text }))}
                          placeholder="e.g. 192.168.1.106"
                          placeholderTextColor="#94a3b8"
                          className="border border-border rounded-xl px-4 py-3 text-text-primary bg-slate-50 focus:bg-white text-base"
                          style={{ minHeight: 44 }}
                          keyboardType="numeric"
                        />
                      </View>

                      <View className="w-full md:w-1/2 px-3 mb-5">
                        <Text className="text-sm font-semibold text-text-primary mb-2">Port</Text>
                        <TextInput
                          value={String(formState.port)}
                          onChangeText={(text) => setFormState(prev => ({ ...prev, port: Number(text) || 0 }))}
                          placeholder="9100"
                          placeholderTextColor="#94a3b8"
                          className="border border-border rounded-xl px-4 py-3 text-text-primary bg-slate-50 focus:bg-white text-base"
                          style={{ minHeight: 44 }}
                          keyboardType="number-pad"
                        />
                      </View>
                    </>
                  )}

                  {/* Printer Role */}
                  <View className="w-full md:w-1/2 px-3 mb-5">
                    <Text className="text-sm font-semibold text-text-primary mb-2">Printer Role</Text>
                    <View className="flex-row gap-3">
                      {[
                        { value: 'bill', label: 'Bill Printer' },
                        { value: 'kitchen', label: 'Kitchen Printer' }
                      ].map((role) => {
                        const isSelected = formState.printer_role === role.value;
                        return (
                          <Pressable
                            key={role.value}
                            className={`flex-1 border rounded-xl items-center justify-center ${
                              isSelected ? 'bg-primary border-primary' : 'bg-slate-50 border-border active:bg-slate-100'
                            }`}
                            style={({ pressed }) => [
                              { height: 44, justifyContent: 'center', flex: 1 },
                              pressed && { opacity: 0.9 }
                            ]}
                            onPress={() => setFormState(prev => ({ ...prev, printer_role: role.value }))}
                          >
                            <Text className={`font-semibold text-sm ${isSelected ? 'text-white' : 'text-text-secondary'}`}>
                              {role.label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>

                  {/* Toggles */}
                  <View className="w-full px-3 mb-3 flex-row gap-6 mt-2 flex-wrap">
                    <View className="flex-row items-center gap-3">
                      <Switch
                        value={formState.is_default}
                        onValueChange={(val) => setFormState(prev => ({ ...prev, is_default: val }))}
                        trackColor={{ false: '#cbd5e1', true: colors.accent }}
                        thumbColor={formState.is_default ? colors.primary : '#f4f3f4'}
                      />
                      <Text className="text-sm font-semibold text-text-primary">Default Printer</Text>
                    </View>

                    <View className="flex-row items-center gap-3">
                      <Switch
                        value={formState.is_active}
                        onValueChange={(val) => setFormState(prev => ({ ...prev, is_active: val }))}
                        trackColor={{ false: '#cbd5e1', true: colors.accent }}
                        thumbColor={formState.is_active ? colors.primary : '#f4f3f4'}
                      />
                      <Text className="text-sm font-semibold text-text-primary">Active</Text>
                    </View>
                  </View>

                  {/* Advanced Section Dropdown Accordion */}
                  <View className="w-full px-3 border-t border-border pt-4 mt-2">
                    <Pressable
                      className="flex-row items-center gap-2"
                      style={({ pressed }) => pressed && { opacity: 0.8 }}
                      onPress={() => setShowAdvanced(!showAdvanced)}
                    >
                      <Text className="text-sm font-bold text-text-secondary">Advanced Settings</Text>
                      {showAdvanced ? (
                        <ChevronUp size={16} color={colors.textSecondary} />
                      ) : (
                        <ChevronDown size={16} color={colors.textSecondary} />
                      )}
                    </Pressable>

                    {showAdvanced && (
                      <View className="mt-4 bg-slate-50 p-4 border border-border rounded-xl">
                        <Text className="text-xs font-semibold text-text-secondary mb-1">Detected OS Spooler Printer</Text>
                        <Text className="text-sm text-text-primary font-mono select-all">
                          {formState.os_printer_name ?? 'No matching OS printer detected yet. Run "Test Connection" to discover.'}
                        </Text>
                      </View>
                    )}
                  </View>

                </View>
              </View>

              {/* Form Actions Footer */}
              <View className="flex-row gap-4 border-t border-border pt-5 mt-6 justify-end flex-wrap">
                <Pressable
                  className="px-6 rounded-xl border border-border bg-white active:bg-slate-50 items-center justify-center flex-row gap-2"
                  style={({ pressed }) => [pressed && { opacity: 0.9 }, { height: 44 }]}
                  onPress={handleTestConnection}
                  disabled={testing || submitting}
                >
                  {testing ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Text className="font-bold text-text-primary text-sm">Test Connection</Text>
                  )}
                </Pressable>

                <Pressable
                  className="px-8 rounded-xl bg-primary active:opacity-90 items-center justify-center flex-row gap-2"
                  style={({ pressed }) => [pressed && { opacity: 0.9 }, { height: 44 }]}
                  onPress={handleSave}
                  disabled={testing || submitting}
                >
                  {submitting ? (
                    <ActivityIndicator size="small" color="white" />
                  ) : (
                    <Text className="font-bold text-white text-sm">Save Configuration</Text>
                  )}
                </Pressable>
              </View>
            </View>

          </View>
        </>
      ) : (
        <MenuManagement />
      )}
    </View>
  );
}
