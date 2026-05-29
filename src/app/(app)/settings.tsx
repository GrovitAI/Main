import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, Pressable, FlatList, TextInput, ActivityIndicator, Switch, Platform } from 'react-native';
import { Printer as PrinterIcon, Plus, Trash2, Check, AlertCircle, Wifi, Settings } from 'lucide-react-native';
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

  // Live connection status indicator state
  const [connStatus, setConnStatus] = useState<'connected' | 'unreachable' | 'offline' | 'checking'>('checking');

  // Load configured printers
  const loadPrinters = async () => {
    setLoading(true);
    setError(null);
    const res = await fetchPrinters();
    if (res.error) {
      setError(res.error);
    } else if (res.data) {
      setPrinters(res.data);
      if (res.data.length > 0) {
        // If we already have a selected printer, re-select it to get fresh data
        const current = selectedPrinter 
          ? res.data.find(p => p.id === selectedPrinter.id) 
          : null;
        handleSelectPrinter(current || res.data[0]);
      } else {
        handleStartNew();
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    loadPrinters();
  }, []);

  // Async connectivity checking
  const checkConnectivity = async (currentForm: PrinterFormState) => {
    if (currentForm.connection !== 'network' || !currentForm.ip_address) {
      setConnStatus('unreachable');
      return;
    }
    setConnStatus('checking');
    try {
      const status = await diagnosePrinterConnection(currentForm);
      if (status === 'missing') {
        setConnStatus('unreachable');
      } else {
        setConnStatus(status as any);
      }
    } catch {
      setConnStatus('offline');
    }
  };

  // Check connectivity whenever critical values are edited
  useEffect(() => {
    checkConnectivity(formState);
  }, [formState.connection, formState.ip_address, formState.port]);

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
    checkConnectivity(selectedState);
  };

  const handleStartNew = () => {
    setSelectedPrinter(null);
    setFormState({ ...initialFormState });
    setIsNew(true);
    setFormError(null);
    setSuccessMsg(null);
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
    };

    const res = await savePrinter(printerPayload);
    setSubmitting(false);

    if (res.error) {
      setFormError(res.error);
    } else if (res.data) {
      setSuccessMsg(`Printer "${res.data.name}" saved successfully!`);
      const savedPrinterId = res.data.id;
      const updatedRes = await fetchPrinters();
      if (updatedRes.data) {
        setPrinters(updatedRes.data);
        const saved = updatedRes.data.find(p => p.id === savedPrinterId || p.name === printerPayload.name);
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
      setSelectedPrinter(null);
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

      await printerService.testPrinter(testPrinterPayload);
      setSuccessMsg('Test receipt printed successfully!');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes('offline') || msg.toLowerCase().includes('agent') || msg.toLowerCase().includes('service offline')) {
        setFormError('Printer service offline. Please start Grovit Print Agent.');
      } else {
        setFormError(msg);
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
          <View className="flex-row items-center gap-1.5 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
            <View className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <Text className="text-emerald-700 text-[10px] font-black uppercase">Connected</Text>
          </View>
        );
      case 'unreachable':
        return (
          <View className="flex-row items-center gap-1.5 bg-amber-50 px-3 py-1 rounded-full border border-amber-200">
            <View className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            <Text className="text-amber-700 text-[10px] font-black uppercase">Printer Unreachable</Text>
          </View>
        );
      case 'offline':
        return (
          <View className="flex-row items-center gap-1.5 bg-rose-50 px-3 py-1 rounded-full border border-rose-200">
            <View className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
            <Text className="text-rose-700 text-[10px] font-black uppercase">Agent Offline</Text>
          </View>
        );
      case 'checking':
      default:
        return (
          <View className="flex-row items-center gap-1.5 bg-slate-50 px-3 py-1 rounded-full border border-slate-200">
            <ActivityIndicator size="small" color={colors.primary} style={{ transform: [{ scale: 0.6 }] }} />
            <Text className="text-slate-600 text-[10px] font-black uppercase">Checking...</Text>
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
          <View className="mb-4 flex-row items-center justify-between border border-border p-3.5 bg-white rounded-2xl shadow-xs">
            <View className="flex-row items-center gap-3">
              <View className="p-2 bg-accentSoft rounded-xl">
                <PrinterIcon size={20} color={colors.primary} />
              </View>
              <View>
                <Text className="text-lg font-black text-text-primary">Network Printer Management</Text>
                <Text className="text-xs text-text-secondary font-medium">Manage network thermal receipt and kitchen tickets</Text>
              </View>
            </View>

            <Pressable
              className="flex-row items-center gap-1.5 px-4 py-2 rounded-xl bg-primary active:opacity-90"
              style={({ pressed }) => pressed && { opacity: 0.9 }}
              onPress={handleStartNew}
            >
              <Plus size={16} color="white" />
              <Text className="text-white font-extrabold text-xs">Add Printer</Text>
            </Pressable>
          </View>

          {/* Main layout: responsive side-by-side or stacked grid */}
          <View className={`flex-1 ${Platform.OS === 'web' ? 'flex-row gap-4' : 'flex-col gap-4'}`}>
            
            {/* Left Side: Printers list */}
            <View className={`bg-white rounded-2xl p-4 border border-border shadow-xs ${Platform.OS === 'web' ? 'w-5/12' : 'w-full'}`}>
              <Text className="text-sm font-black text-text-primary mb-3">Configured Printers</Text>

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
                  <PrinterIcon size={40} color={colors.textSecondary} className="opacity-40" />
                  <Text className="text-text-primary font-black text-base mt-3 text-center">No Printers Configured</Text>
                  <Text className="text-text-secondary text-xs text-center mt-1">
                    Click "Add Printer" to set up your network thermal printer.
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
                        className={`p-3.5 mb-2.5 rounded-2xl border transition-all ${
                          isSelected
                            ? 'bg-emerald-50/50 border-emerald-500 shadow-xs'
                            : 'bg-white border-slate-100 active:bg-slate-50'
                        }`}
                      >
                        <View className="flex-row items-center justify-between">
                          <View className="flex-1 mr-2">
                            <View className="flex-row items-center gap-1.5 flex-wrap">
                              <Text className="font-extrabold text-slate-800 text-sm">{item.name}</Text>
                              {item.is_default && (
                                <View className="bg-emerald-500 px-1.5 py-0.5 rounded">
                                  <Text className="text-white text-[9px] font-black uppercase tracking-wider">Default</Text>
                                </View>
                              )}
                              {!item.is_active && (
                                <View className="bg-slate-200 px-1.5 py-0.5 rounded">
                                  <Text className="text-slate-600 text-[9px] font-black uppercase tracking-wider">Inactive</Text>
                                </View>
                              )}
                            </View>
                            
                            <View className="flex-row items-center gap-2 mt-1.5 flex-wrap">
                              <View className="flex-row items-center gap-1 bg-slate-100 px-1.5 py-0.5 rounded">
                                <Wifi size={10} color={colors.textSecondary} />
                                <Text className="text-slate-600 text-[9px] font-black uppercase tracking-wider">
                                  {item.printer_role === 'bill' ? 'Bill Printer' : 'Kitchen Printer'}
                                </Text>
                              </View>

                              {item.ip_address && (
                                <Text className="text-slate-500 text-xs font-bold">
                                  • {item.ip_address}:{item.port} ({item.paper_width})
                                </Text>
                              )}
                            </View>
                          </View>
                          
                          <Pressable
                            style={({ pressed }) => pressed && { opacity: 0.8 }}
                            className="p-1.5 bg-red-50 active:bg-red-100 rounded-lg"
                            onPress={(e) => {
                              e.stopPropagation();
                              handleDelete(item.id);
                            }}
                          >
                            <Trash2 size={13} color="#dc2626" />
                          </Pressable>
                        </View>
                      </Pressable>
                    );
                  }}
                />
              )}
            </View>

            {/* Right Side: Configuration Detail / Form */}
            <View className="flex-1 bg-white rounded-2xl p-4 border border-border shadow-xs justify-between">
              <View>
                <View className="border-b border-border pb-2.5 mb-4 flex-row items-center justify-between">
                  <View className="flex-row items-center gap-2">
                    <Settings size={16} color={colors.primary} />
                    <Text className="text-sm font-extrabold text-text-primary">
                      {isNew ? 'New Printer Configuration' : 'Edit Printer Configuration'}
                    </Text>
                  </View>
                  {renderStatusIndicator()}
                </View>

                {formError && (
                  <View className="flex-row items-center gap-2 bg-red-50 p-3 border border-red-200 rounded-xl mb-4">
                    <AlertCircle size={16} color="#dc2626" />
                    <Text className="text-red-700 font-bold flex-1 text-xs">{formError}</Text>
                  </View>
                )}

                {successMsg && (
                  <View className="flex-row items-center gap-2 bg-green-50 p-3 border border-green-200 rounded-xl mb-4">
                    <Check size={16} color="#15803d" />
                    <Text className="text-green-700 font-bold flex-1 text-xs">{successMsg}</Text>
                  </View>
                )}

                {/* Inputs grid */}
                <View className="flex-row flex-wrap -mx-2">
                  {/* Printer Friendly Name */}
                  <View className="w-full md:w-1/2 px-2 mb-3.5">
                    <Text className="text-xs font-black text-text-primary mb-1.5">Printer Name</Text>
                    <TextInput
                      value={formState.name}
                      onChangeText={(text) => setFormState(prev => ({ ...prev, name: text }))}
                      placeholder="e.g. Cash Counter"
                      placeholderTextColor="#94a3b8"
                      className="border border-border rounded-xl px-3 py-2 text-text-primary bg-slate-50 focus:bg-white text-sm"
                      style={{ minHeight: 38 }}
                    />
                  </View>

                  {/* Printer Role */}
                  <View className="w-full md:w-1/2 px-2 mb-3.5">
                    <Text className="text-xs font-black text-text-primary mb-1.5">Printer Role</Text>
                    <View className="flex-row gap-2">
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
                              { height: 38, justifyContent: 'center', flex: 1 },
                              pressed && { opacity: 0.9 }
                            ]}
                            onPress={() => setFormState(prev => ({ ...prev, printer_role: role.value }))}
                          >
                            <Text className={`font-extrabold text-xs ${isSelected ? 'text-white' : 'text-text-secondary'}`}>
                              {role.label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>

                  {/* Network IP Address */}
                  <View className="w-full md:w-1/2 px-2 mb-3.5">
                    <Text className="text-xs font-black text-text-primary mb-1.5">IP Address</Text>
                    <TextInput
                      value={formState.ip_address ?? ''}
                      onChangeText={(text) => setFormState(prev => ({ ...prev, ip_address: text }))}
                      placeholder="e.g. 192.168.1.106"
                      placeholderTextColor="#94a3b8"
                      className="border border-border rounded-xl px-3 py-2 text-text-primary bg-slate-50 focus:bg-white text-sm"
                      style={{ minHeight: 38 }}
                      keyboardType="numeric"
                    />
                  </View>

                  {/* Network Port */}
                  <View className="w-full md:w-1/2 px-2 mb-3.5">
                    <Text className="text-xs font-black text-text-primary mb-1.5">Port</Text>
                    <TextInput
                      value={String(formState.port)}
                      onChangeText={(text) => setFormState(prev => ({ ...prev, port: Number(text) || 0 }))}
                      placeholder="9100"
                      placeholderTextColor="#94a3b8"
                      className="border border-border rounded-xl px-3 py-2 text-text-primary bg-slate-50 focus:bg-white text-sm"
                      style={{ minHeight: 38 }}
                      keyboardType="number-pad"
                    />
                  </View>

                  {/* Paper Width */}
                  <View className="w-full md:w-1/2 px-2 mb-3.5">
                    <Text className="text-xs font-black text-text-primary mb-1.5">Paper Width</Text>
                    <View className="flex-row gap-2">
                      {['80mm', '58mm'].map((size) => {
                        const isSelected = formState.paper_width === size;
                        return (
                          <Pressable
                            key={size}
                            className={`flex-1 border rounded-xl items-center justify-center ${
                              isSelected ? 'bg-primary border-primary' : 'bg-slate-50 border-border active:bg-slate-100'
                            }`}
                            style={({ pressed }) => [
                              { height: 38, justifyContent: 'center', flex: 1 },
                              pressed && { opacity: 0.9 }
                            ]}
                            onPress={() => setFormState(prev => ({ ...prev, paper_width: size }))}
                          >
                            <Text className={`font-extrabold text-xs ${isSelected ? 'text-white' : 'text-text-secondary'}`}>
                              {size}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>

                  {/* Empty Spacer to Align Switches */}
                  <View className="w-full md:w-1/2 px-2 mb-3.5" />

                  {/* Switches */}
                  <View className="w-full px-2 mb-2 flex-row gap-5 mt-1 flex-wrap">
                    <View className="flex-row items-center gap-2">
                      <Switch
                        value={formState.is_default}
                        onValueChange={(val) => setFormState(prev => ({ ...prev, is_default: val }))}
                        trackColor={{ false: '#cbd5e1', true: colors.accent }}
                        thumbColor={formState.is_default ? colors.primary : '#f4f3f4'}
                        style={{ transform: [{ scale: 0.85 }] }}
                      />
                      <Text className="text-xs font-extrabold text-text-primary">Default Printer</Text>
                    </View>

                    <View className="flex-row items-center gap-2">
                      <Switch
                        value={formState.is_active}
                        onValueChange={(val) => setFormState(prev => ({ ...prev, is_active: val }))}
                        trackColor={{ false: '#cbd5e1', true: colors.accent }}
                        thumbColor={formState.is_active ? colors.primary : '#f4f3f4'}
                        style={{ transform: [{ scale: 0.85 }] }}
                      />
                      <Text className="text-xs font-extrabold text-text-primary">Active</Text>
                    </View>
                  </View>

                </View>
              </View>

              {/* Form Actions Footer */}
              <View className="flex-row gap-3 border-t border-border pt-4 mt-4 justify-end flex-wrap">
                <Pressable
                  className="px-5 rounded-xl border border-border bg-white active:bg-slate-50 items-center justify-center flex-row gap-1.5"
                  style={({ pressed }) => [pressed && { opacity: 0.9 }, { height: 38 }]}
                  onPress={handleTestConnection}
                  disabled={testing || submitting}
                >
                  {testing ? (
                    <ActivityIndicator size="small" color={colors.primary} style={{ transform: [{ scale: 0.8 }] }} />
                  ) : (
                    <Text className="font-extrabold text-text-primary text-xs">Test Connection</Text>
                  )}
                </Pressable>

                <Pressable
                  className="px-7 rounded-xl bg-primary active:opacity-90 items-center justify-center flex-row gap-1.5"
                  style={({ pressed }) => [pressed && { opacity: 0.9 }, { height: 38 }]}
                  onPress={handleSave}
                  disabled={testing || submitting}
                >
                  {submitting ? (
                    <ActivityIndicator size="small" color="white" style={{ transform: [{ scale: 0.8 }] }} />
                  ) : (
                    <Text className="font-extrabold text-white text-xs">Save Configuration</Text>
                  )}
                </Pressable>
              </View>
            </View>

          </View>
        </>
      ) : (
        <MenuManagement onBack={() => setActiveTab('printers')} />
      )}
    </View>
  );
}
