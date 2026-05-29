import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, TextInput, ActivityIndicator, Switch, Platform, ScrollView } from 'react-native';
import { Printer as PrinterIcon, Plus, Trash2, Check, AlertCircle, Settings, ChevronDown, ChevronUp, Wifi } from 'lucide-react-native';
import { colors } from '@/lib/pos/brand';
import { fetchPrinters, savePrinter, deletePrinter, type Printer } from '@/lib/pos/printer-db-service';
import { printerService, diagnosePrinterConnection } from '@/lib/printer/printer-service';
import { checkAgentHealth } from '@/lib/printer/print-agent-service';
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
  
  const [formError, setFormError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Global print agent status
  const [agentOnline, setAgentOnline] = useState<boolean | null>(null);
  const [checkingAgent, setCheckingAgent] = useState(false);

  // Accordion state
  const [expandedPrinterId, setExpandedPrinterId] = useState<string | null>(null);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [formState, setFormState] = useState<PrinterFormState>(initialFormState);

  // Connectivity status of the expanded printer
  const [connStatus, setConnStatus] = useState<'connected' | 'unreachable' | 'offline' | 'checking'>('checking');

  const checkAgentStatus = async () => {
    setCheckingAgent(true);
    try {
      const online = await checkAgentHealth();
      setAgentOnline(online);
    } catch {
      setAgentOnline(false);
    } finally {
      setCheckingAgent(false);
    }
  };

  const loadPrinters = async () => {
    setLoading(true);
    const res = await fetchPrinters();
    if (res.data) {
      setPrinters(res.data);
      if (res.data.length > 0 && !expandedPrinterId && !isAddingNew) {
        // Expand the default or first printer by default
        const defaultPrinter = res.data.find(p => p.is_default) || res.data[0];
        handleExpandPrinter(defaultPrinter);
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    checkAgentStatus();
    loadPrinters();
  }, []);

  const checkPrinterConnectivity = async (ip: string, port: number) => {
    if (!ip) {
      setConnStatus('unreachable');
      return;
    }
    setConnStatus('checking');
    try {
      const status = await diagnosePrinterConnection({
        name: 'Check',
        type: 'epson_thermal',
        connection: 'network',
        ip_address: ip,
        port: port,
        paper_width: '80mm',
        printer_role: 'bill',
        is_default: false,
        is_active: true,
        os_printer_name: null,
      });
      if (status === 'missing') {
        setConnStatus('unreachable');
      } else {
        setConnStatus(status as any);
      }
    } catch {
      setConnStatus('offline');
    }
  };

  // Run reachability checks when IP/Port is modified in the expanded form
  useEffect(() => {
    if (formState.ip_address) {
      checkPrinterConnectivity(formState.ip_address, formState.port);
    }
  }, [formState.ip_address, formState.port]);

  const handleExpandPrinter = (printer: Printer) => {
    setIsAddingNew(false);
    setExpandedPrinterId(printer.id);
    const state: PrinterFormState = {
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
    setFormState(state);
    setFormError(null);
    setSuccessMsg(null);
    checkPrinterConnectivity(state.ip_address ?? '', state.port);
  };

  const handleCollapsePrinter = () => {
    setExpandedPrinterId(null);
  };

  const handleStartNew = () => {
    setExpandedPrinterId(null);
    setIsAddingNew(true);
    setFormState({ ...initialFormState });
    setFormError(null);
    setSuccessMsg(null);
    setConnStatus('unreachable');
  };

  const handleCancelNew = () => {
    setIsAddingNew(false);
    if (printers.length > 0) {
      const defaultPrinter = printers.find(p => p.is_default) || printers[0];
      handleExpandPrinter(defaultPrinter);
    }
  };

  const validateForm = (): boolean => {
    if (!formState.name.trim()) {
      setFormError('Printer name is required.');
      return false;
    }
    if (!formState.ip_address?.trim()) {
      setFormError('IP Address is required.');
      return false;
    }
    const ipRegex = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/;
    if (!ipRegex.test(formState.ip_address.trim())) {
      setFormError('Please enter a valid IPv4 IP Address.');
      return false;
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
      ip_address: (formState.ip_address || '').trim(),
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
          handleExpandPrinter(saved);
        }
      }
    }
  };

  const handleDelete = async (id: string) => {
    if (!id) return;
    setLoading(true);
    const res = await deletePrinter(id);
    if (!res.error) {
      setExpandedPrinterId(null);
      const updatedRes = await fetchPrinters();
      if (updatedRes.data) {
        setPrinters(updatedRes.data);
        if (updatedRes.data.length > 0) {
          const next = updatedRes.data.find(p => p.is_default) || updatedRes.data[0];
          handleExpandPrinter(next);
        } else {
          handleStartNew();
        }
      }
    }
    setLoading(false);
  };

  const handleTestConnection = async () => {
    if (!validateForm()) return;

    setTesting(true);
    setFormError(null);
    setSuccessMsg(null);

    try {
      const testPrinterPayload = {
        ...formState,
        ip_address: (formState.ip_address || '').trim(),
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
      if (formState.ip_address) {
        checkPrinterConnectivity(formState.ip_address, formState.port);
      }
    }
  };

  const renderStatusBadge = (status: typeof connStatus) => {
    switch (status) {
      case 'connected':
        return (
          <View className="flex-row items-center gap-1 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
            <View className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <Text className="text-emerald-700 text-[9px] font-black uppercase">Connected</Text>
          </View>
        );
      case 'unreachable':
        return (
          <View className="flex-row items-center gap-1 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
            <View className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            <Text className="text-amber-700 text-[9px] font-black uppercase">Unreachable</Text>
          </View>
        );
      case 'offline':
        return (
          <View className="flex-row items-center gap-1 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
            <View className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
            <Text className="text-rose-700 text-[9px] font-black uppercase">Agent Offline</Text>
          </View>
        );
      case 'checking':
      default:
        return (
          <View className="flex-row items-center gap-1 bg-slate-50 px-2 py-0.5 rounded-full border border-slate-200">
            <ActivityIndicator size="small" color={colors.primary} style={{ transform: [{ scale: 0.5 }] }} />
            <Text className="text-slate-600 text-[9px] font-black uppercase">Checking...</Text>
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
        <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
          {/* Header section with print agent health status */}
          <View className="mb-4 bg-white border border-border p-4 rounded-2xl shadow-xs flex-row items-center justify-between flex-wrap gap-3">
            <View className="flex-row items-center gap-3">
              <View className="p-2 bg-accentSoft rounded-xl">
                <PrinterIcon size={20} color={colors.primary} />
              </View>
              <View>
                <Text className="text-base font-black text-text-primary">Local Print Agent Setup</Text>
                <Text className="text-xs text-text-secondary font-medium leading-relaxed">Direct IP network printing via local print agent bridge</Text>
              </View>
            </View>

            {/* Print Agent Global status indicator */}
            <Pressable 
              onPress={checkAgentStatus}
              className="flex-row items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-100 active:bg-slate-100"
            >
              <Text className="text-[10px] font-black text-slate-500 uppercase">Agent Status:</Text>
              {checkingAgent ? (
                <ActivityIndicator size="small" color={colors.primary} style={{ transform: [{ scale: 0.7 }] }} />
              ) : agentOnline === true ? (
                <View className="flex-row items-center gap-1">
                  <View className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <Text className="text-emerald-700 text-[10px] font-extrabold">🟢 Online</Text>
                </View>
              ) : (
                <View className="flex-row items-center gap-1">
                  <View className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
                  <Text className="text-rose-700 text-[10px] font-extrabold">🔴 Offline</Text>
                </View>
              )}
            </Pressable>
          </View>

          {/* Simple compact grid list of network printer setup forms */}
          <View className="gap-3.5 max-w-4xl mx-auto w-full">
            {loading ? (
              <View className="items-center justify-center py-12 bg-white rounded-2xl border border-border">
                <ActivityIndicator size="large" color={colors.primary} />
              </View>
            ) : (
              <>
                {printers.map((printer) => {
                  const isExpanded = expandedPrinterId === printer.id;
                  return (
                    <View 
                      key={printer.id} 
                      className={`bg-white rounded-2xl border transition-all ${
                        isExpanded ? 'border-primary shadow-xs' : 'border-border shadow-xs'
                      }`}
                    >
                      {/* Accordion header */}
                      <Pressable
                        onPress={() => isExpanded ? handleCollapsePrinter() : handleExpandPrinter(printer)}
                        className="flex-row items-center justify-between p-4 flex-wrap gap-2"
                      >
                        <View className="flex-row items-center gap-3 flex-1 min-w-[240px]">
                          <Wifi size={18} color={printer.is_active ? colors.primary : colors.textSecondary} />
                          <View>
                            <View className="flex-row items-center gap-2 flex-wrap">
                              <Text className="font-black text-slate-800 text-sm">{printer.name}</Text>
                              {printer.is_default && (
                                <View className="bg-emerald-500 px-1.5 py-0.5 rounded">
                                  <Text className="text-white text-[8px] font-black uppercase tracking-wider">Default</Text>
                                </View>
                              )}
                              {!printer.is_active && (
                                <View className="bg-slate-200 px-1.5 py-0.5 rounded">
                                  <Text className="text-slate-600 text-[8px] font-black uppercase tracking-wider">Inactive</Text>
                                </View>
                              )}
                            </View>
                            <Text className="text-[10px] text-slate-500 mt-0.5 font-bold uppercase tracking-wider">
                              {printer.printer_role === 'bill' ? 'Bill Printer' : 'Kitchen Printer'} • {printer.ip_address}:{printer.port} ({printer.paper_width})
                            </Text>
                          </View>
                        </View>

                        <View className="flex-row items-center gap-3">
                          {isExpanded && renderStatusBadge(connStatus)}
                          {isExpanded ? <ChevronUp size={16} color="#64748b" /> : <ChevronDown size={16} color="#64748b" />}
                        </View>
                      </Pressable>

                      {/* Accordion body form */}
                      {isExpanded && (
                        <View className="border-t border-slate-100 p-5 bg-slate-50/50 rounded-b-2xl">
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

                          {/* 2-column compact form input grid */}
                          <View className="flex-row flex-wrap -mx-2">
                            {/* Printer Name */}
                            <View className="w-full md:w-1/2 px-2 mb-3.5">
                              <Text className="text-xs font-black text-text-primary mb-1.5">Printer Name (Label)</Text>
                              <TextInput
                                value={formState.name}
                                onChangeText={(text) => setFormState(prev => ({ ...prev, name: text }))}
                                placeholder="e.g. Cash Counter"
                                placeholderTextColor="#94a3b8"
                                className="border border-border rounded-xl px-3 py-2 text-text-primary bg-white focus:bg-white text-sm"
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
                                        isSelected ? 'bg-primary border-primary' : 'bg-white border-border active:bg-slate-50'
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

                            {/* IP Address */}
                            <View className="w-full md:w-1/2 px-2 mb-3.5">
                              <Text className="text-xs font-black text-text-primary mb-1.5">IP Address</Text>
                              <TextInput
                                value={formState.ip_address ?? ''}
                                onChangeText={(text) => setFormState(prev => ({ ...prev, ip_address: text }))}
                                placeholder="e.g. 192.168.1.106"
                                placeholderTextColor="#94a3b8"
                                className="border border-border rounded-xl px-3 py-2 text-text-primary bg-white focus:bg-white text-sm"
                                style={{ minHeight: 38 }}
                                keyboardType="numeric"
                              />
                            </View>

                            {/* Port */}
                            <View className="w-full md:w-1/2 px-2 mb-3.5">
                              <Text className="text-xs font-black text-text-primary mb-1.5">Port</Text>
                              <TextInput
                                value={String(formState.port)}
                                onChangeText={(text) => setFormState(prev => ({ ...prev, port: Number(text) || 0 }))}
                                placeholder="9100"
                                placeholderTextColor="#94a3b8"
                                className="border border-border rounded-xl px-3 py-2 text-text-primary bg-white focus:bg-white text-sm"
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
                                        isSelected ? 'bg-primary border-primary' : 'bg-white border-border active:bg-slate-50'
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

                          {/* Accordion form actions */}
                          <View className="flex-row gap-3 border-t border-slate-200/60 pt-4 mt-4 justify-between flex-wrap">
                            <Pressable
                              style={({ pressed }) => [
                                { height: 38 },
                                pressed && { opacity: 0.8 }
                              ]}
                              className="px-4 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 active:bg-red-200 flex-row gap-1.5 items-center justify-center"
                              onPress={() => handleDelete(printer.id)}
                            >
                              <Trash2 size={14} color="#dc2626" />
                              <Text className="font-extrabold text-red-700 text-xs">Delete Printer</Text>
                            </Pressable>

                            <View className="flex-row gap-3">
                              <Pressable
                                className="px-4 rounded-xl border border-border bg-white active:bg-slate-50 items-center justify-center flex-row gap-1.5"
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
                                className="px-6 rounded-xl bg-primary active:opacity-90 items-center justify-center flex-row gap-1.5"
                                style={({ pressed }) => [pressed && { opacity: 0.9 }, { height: 38 }]}
                                onPress={handleSave}
                                disabled={testing || submitting}
                              >
                                {submitting ? (
                                  <ActivityIndicator size="small" color="white" style={{ transform: [{ scale: 0.8 }] }} />
                                ) : (
                                  <Text className="font-extrabold text-white text-xs">Save Settings</Text>
                                )}
                              </Pressable>
                            </View>
                          </View>
                        </View>
                      )}
                    </View>
                  );
                })}

                {/* Collapsed + Add Another Printer trigger & expanded form */}
                {isAddingNew ? (
                  <View className="bg-white rounded-2xl border border-primary shadow-xs overflow-hidden">
                    <View className="p-4 bg-slate-50 flex-row justify-between items-center border-b border-border">
                      <View className="flex-row items-center gap-2">
                        <PrinterIcon size={18} color={colors.primary} />
                        <Text className="font-black text-slate-800 text-sm">Add Another Printer</Text>
                      </View>
                      <Pressable 
                        onPress={handleCancelNew}
                        className="px-3 py-1.5 rounded-lg border border-border bg-white active:bg-slate-50"
                      >
                        <Text className="text-[10px] font-black text-slate-500 uppercase">Cancel</Text>
                      </Pressable>
                    </View>

                    <View className="p-5">
                      {formError && (
                        <View className="flex-row items-center gap-2 bg-red-50 p-3 border border-red-200 rounded-xl mb-4">
                          <AlertCircle size={16} color="#dc2626" />
                          <Text className="text-red-700 font-bold flex-1 text-xs">{formError}</Text>
                        </View>
                      )}

                      <View className="flex-row flex-wrap -mx-2">
                        {/* Printer Name */}
                        <View className="w-full md:w-1/2 px-2 mb-3.5">
                          <Text className="text-xs font-black text-text-primary mb-1.5">Printer Name (Label)</Text>
                          <TextInput
                            value={formState.name}
                            onChangeText={(text) => setFormState(prev => ({ ...prev, name: text }))}
                            placeholder="e.g. Kitchen Printer"
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

                        {/* IP Address */}
                        <View className="w-full md:w-1/2 px-2 mb-3.5">
                          <Text className="text-xs font-black text-text-primary mb-1.5">IP Address</Text>
                          <TextInput
                            value={formState.ip_address ?? ''}
                            onChangeText={(text) => setFormState(prev => ({ ...prev, ip_address: text }))}
                            placeholder="e.g. 192.168.1.107"
                            placeholderTextColor="#94a3b8"
                            className="border border-border rounded-xl px-3 py-2 text-text-primary bg-slate-50 focus:bg-white text-sm"
                            style={{ minHeight: 38 }}
                            keyboardType="numeric"
                          />
                        </View>

                        {/* Port */}
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

                      {/* Actions */}
                      <View className="flex-row gap-3 border-t border-slate-200 pt-4 mt-4 justify-end flex-wrap">
                        <Pressable
                          className="px-4 rounded-xl border border-border bg-white active:bg-slate-50 items-center justify-center flex-row gap-1.5"
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
                          className="px-6 rounded-xl bg-primary active:opacity-90 items-center justify-center flex-row gap-1.5"
                          style={({ pressed }) => [pressed && { opacity: 0.9 }, { height: 38 }]}
                          onPress={handleSave}
                          disabled={testing || submitting}
                        >
                          {submitting ? (
                            <ActivityIndicator size="small" color="white" style={{ transform: [{ scale: 0.8 }] }} />
                          ) : (
                            <Text className="font-extrabold text-white text-xs">Save Settings</Text>
                          )}
                        </Pressable>
                      </View>
                    </View>
                  </View>
                ) : (
                  <Pressable
                    onPress={handleStartNew}
                    className="bg-slate-50 border border-dashed border-slate-300 py-3.5 rounded-2xl flex-row items-center justify-center gap-2 active:bg-slate-100/50"
                  >
                    <Plus size={16} color={colors.primary} />
                    <Text className="text-xs font-extrabold text-slate-600 uppercase tracking-wider">+ Add Another Printer</Text>
                  </Pressable>
                )}
              </>
            )}
          </View>
        </ScrollView>
      ) : (
        <MenuManagement onBack={() => setActiveTab('printers')} />
      )}
    </View>
  );
}
