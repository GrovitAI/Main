import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, TextInput, ActivityIndicator, Switch, Platform, ScrollView } from 'react-native';
import { Printer as PrinterIcon, Plus, Trash2, Check, AlertCircle, Settings, ChevronDown, ChevronUp, Wifi, BookOpen } from 'lucide-react-native';
import { colors, brand } from '@/lib/pos/brand';
import { fetchPrinters, savePrinter, deletePrinter, type Printer } from '@/lib/pos/printer-db-service';
import { printerService, diagnosePrinterConnection } from '@/lib/printer/printer-service';
import { checkAgentHealth } from '@/lib/printer/print-agent-service';
import { MenuManagement } from '@/components/settings/MenuManagement';
import { LinearGradient } from 'expo-linear-gradient';

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
  const [activeTab, setActiveTab] = useState<'system' | 'printers' | 'menu'>('printers');
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
          <View className="flex-row items-center bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
            <Text className="text-emerald-700 text-[9px] font-black uppercase">Connected</Text>
          </View>
        );
      case 'unreachable':
        return (
          <View className="flex-row items-center bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
            <Text className="text-amber-700 text-[9px] font-black uppercase">Unreachable</Text>
          </View>
        );
      case 'offline':
        return (
          <View className="flex-row items-center bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full">
            <Text className="text-rose-700 text-[9px] font-black uppercase">Agent Offline</Text>
          </View>
        );
      case 'checking':
      default:
        return (
          <View className="flex-row items-center bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-full">
            <ActivityIndicator size="small" color={colors.primary} style={{ transform: [{ scale: 0.5 }] }} />
            <Text className="text-slate-600 text-[9px] font-extrabold uppercase">Checking...</Text>
          </View>
        );
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#e8f2fa' }}>
      {/* Branded Top Header Surface following the theme of Le Leban */}
      <LinearGradient
        colors={['#024db1', '#01389e']}
        style={{
          paddingHorizontal: 20,
          paddingTop: Platform.OS === 'ios' ? 44 : 16,
          paddingBottom: 14,
          height: Platform.OS === 'ios' ? 104 : 76,
          justifyContent: 'center',
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={{ fontSize: 19, fontWeight: '800', color: '#E2E8F0', fontFamily: 'Outfit, "Avenir Next", system-ui, sans-serif', letterSpacing: -0.5 }}>
              System Preferences
            </Text>
            <Text style={{ fontSize: 12, fontWeight: '500', color: '#E0F2FE', marginTop: 1, opacity: 0.85 }}>
              Configure network thermal hardware, operational parameters, and menu catalog preferences
            </Text>
          </View>
        </View>
      </LinearGradient>

      {/* Main Container with reduced padding for a sharp, high-density layout */}
      <View className="flex-1 p-2.5">
        
        {/* Navigation Tab Bar - Scaled down padding & text sizes */}
        <View className="flex-row bg-white border border-slate-200 rounded-xl mb-3.5 shadow-xs overflow-hidden">
          {[
            { key: 'system', label: 'System Settings', icon: Settings },
            { key: 'printers', label: 'Printer Configuration', icon: PrinterIcon },
            { key: 'menu', label: 'Menu Catalog Manager', icon: BookOpen }
          ].map((tab) => {
            const isSel = activeTab === tab.key;
            const Icon = tab.icon;
            return (
              <Pressable
                key={tab.key}
                onPress={() => setActiveTab(tab.key as any)}
                className="flex-row items-center gap-2 px-4.5 py-3 transition-all cursor-pointer"
                style={{
                  borderBottomWidth: 3,
                  borderBottomColor: isSel ? colors.primary : 'transparent',
                }}
              >
                <Icon size={14} color={isSel ? colors.primary : colors.textSecondary} />
                <Text className={`text-[11px] font-extrabold ${isSel ? 'text-textPrimary' : 'text-textSecondary'}`}>
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {activeTab === 'printers' ? (
          <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
            
            {/* Local Print Agent - Scaled down spacing & paddings */}
            <View className="bg-white border border-slate-200 p-3.5 rounded-xl mb-3.5 shadow-xs flex-row items-center justify-between flex-wrap gap-3">
              <View className="flex-row items-center gap-3.5">
                <View className="p-2 bg-blue-50/50 border border-blue-100 rounded-xl w-9.5 h-9.5 items-center justify-center">
                  <PrinterIcon size={16} color={colors.primary} />
                </View>
                <View>
                  <Text className="text-sm font-black text-textPrimary">Local Print Agent</Text>
                  <Text className="text-[10px] text-textSecondary font-semibold mt-0.5 leading-relaxed">Direct IP network printing via local print agent bridge.</Text>
                </View>
              </View>

              {/* Status indicator */}
              <Pressable 
                onPress={checkAgentStatus}
                className="flex-row items-center gap-2"
              >
                <Text className="text-[10px] font-black text-textSecondary uppercase tracking-wider">Agent Status</Text>
                {checkingAgent ? (
                  <ActivityIndicator size="small" color={colors.primary} style={{ transform: [{ scale: 0.65 }] }} />
                ) : agentOnline === true ? (
                  <View className="bg-emerald-50 border border-emerald-100 px-2.5 py-0.5 rounded-full flex-row items-center gap-1">
                    <View className="w-1 h-1 rounded-full bg-emerald-500" />
                    <Text className="text-emerald-700 text-[9px] font-black uppercase">Online</Text>
                  </View>
                ) : (
                  <View className="bg-rose-50 border border-rose-100 px-2.5 py-0.5 rounded-full flex-row items-center gap-1">
                    <View className="w-1 h-1 rounded-full bg-rose-500" />
                    <Text className="text-rose-700 text-[9px] font-black uppercase">Offline</Text>
                  </View>
                )}
              </Pressable>
            </View>

            {/* Collapsible accordion network configurations stream */}
            <View className="gap-3 w-full">
              {loading ? (
                <View className="items-center justify-center py-8 bg-white rounded-xl border border-slate-200">
                  <ActivityIndicator size="large" color={colors.primary} />
                </View>
              ) : (
                <>
                  {printers.map((printer) => {
                    const isExpanded = expandedPrinterId === printer.id;
                    return (
                      <View 
                        key={printer.id} 
                        className={`bg-white rounded-xl border transition-all ${
                          isExpanded ? 'border-primary shadow-xs' : 'border-slate-200 shadow-xs'
                        }`}
                      >
                        {/* Accordion header - Scaled down padding & spacing */}
                        <Pressable
                          onPress={() => isExpanded ? handleCollapsePrinter() : handleExpandPrinter(printer)}
                          className="flex-row items-center justify-between p-3.5 flex-wrap gap-2"
                        >
                          <View className="flex-row items-center gap-3 flex-1 min-w-[260px]">
                            <Wifi size={16} color={printer.is_active ? colors.primary : colors.textSecondary} />
                            <View className="flex-row items-center gap-2 flex-wrap">
                              <Text className="font-black text-[#0f2744] text-sm">{printer.name}</Text>
                              <Text className="text-[10px] text-textSecondary font-bold">
                                {printer.printer_role === 'bill' ? 'Bill Printer' : 'Kitchen Printer'} • {printer.ip_address}:{printer.port}
                              </Text>
                              {isExpanded && renderStatusBadge(connStatus)}
                            </View>
                          </View>

                          {/* Collapse button style matching the mockup */}
                          <View className="flex-row items-center gap-1 bg-white border border-slate-200 px-2.5 py-1 rounded-lg">
                            <Text className="text-slate-600 text-[10px] font-extrabold uppercase tracking-wider">
                              {isExpanded ? 'Collapse' : 'Expand'}
                            </Text>
                            {isExpanded ? <ChevronUp size={12} color="#64748b" /> : <ChevronDown size={12} color="#64748b" />}
                          </View>
                        </Pressable>

                        {/* Accordion body form */}
                        {isExpanded && (
                          <View className="border-t border-slate-100 p-4 bg-white rounded-b-xl">
                            {formError && (
                              <View className="flex-row items-center gap-2 bg-red-50 p-2.5 border border-red-200 rounded-xl mb-4">
                                <AlertCircle size={16} color="#dc2626" />
                                <Text className="text-red-700 font-bold flex-1 text-xs">{formError}</Text>
                              </View>
                            )}

                            {successMsg && (
                              <View className="flex-row items-center gap-2 bg-green-50 p-2.5 border border-green-200 rounded-xl mb-4">
                                <Check size={16} color="#15803d" />
                                <Text className="text-green-700 font-bold flex-1 text-xs">{successMsg}</Text>
                              </View>
                            )}

                            {/* 2-column input grid with reduced margins & text inputs */}
                            <View className="flex-row flex-wrap -mx-2">
                              {/* Printer Name */}
                              <View className="w-full md:w-1/2 px-2 mb-3.5">
                                <Text className="text-[10px] font-bold text-textSecondary uppercase tracking-wider mb-1.5">Printer Name</Text>
                                <TextInput
                                  value={formState.name}
                                  onChangeText={(text) => setFormState(prev => ({ ...prev, name: text }))}
                                  placeholder="e.g. cash"
                                  placeholderTextColor="#94a3b8"
                                  className="border border-slate-200 rounded-xl px-3 py-1.5 text-textPrimary bg-white focus:border-primary text-xs font-bold select-all w-full"
                                  style={{ minHeight: 36 }}
                                />
                              </View>

                              {/* Printer Role */}
                              <View className="w-full md:w-1/2 px-2 mb-3.5">
                                <Text className="text-[10px] font-bold text-textSecondary uppercase tracking-wider mb-1.5">Printer Role</Text>
                                <View className="flex-row gap-2">
                                  {[
                                    { value: 'bill', label: 'Bill Printer' },
                                    { value: 'kitchen', label: 'Kitchen Printer' }
                                  ].map((role) => {
                                    const isSelected = formState.printer_role === role.value;
                                    return (
                                      <Pressable
                                        key={role.value}
                                        className={`flex-1 border items-center justify-center ${
                                          isSelected 
                                            ? 'bg-[#f4f8fd] border-[#0D6CE0] text-primary' 
                                            : 'bg-white border-slate-200 text-textSecondary active:bg-slate-50'
                                        }`}
                                        style={({ pressed }) => [
                                          { height: 36, borderRadius: 8, borderWidth: isSelected ? 2 : 1 },
                                          pressed && { opacity: 0.9 }
                                        ]}
                                        onPress={() => setFormState(prev => ({ ...prev, printer_role: role.value }))}
                                      >
                                        <Text className={`font-extrabold text-[11px] ${isSelected ? 'text-[#0D6CE0]' : 'text-textSecondary'}`}>
                                          {role.label}
                                        </Text>
                                      </Pressable>
                                    );
                                  })}
                                </View>
                              </View>

                              {/* IP Address */}
                              <View className="w-full md:w-1/2 px-2 mb-3.5">
                                <Text className="text-[10px] font-bold text-textSecondary uppercase tracking-wider mb-1.5">IP Address</Text>
                                <TextInput
                                  value={formState.ip_address ?? ''}
                                  onChangeText={(text) => setFormState(prev => ({ ...prev, ip_address: text }))}
                                  placeholder="e.g. 192.168.1.106"
                                  placeholderTextColor="#94a3b8"
                                  className="border border-slate-200 rounded-xl px-3 py-1.5 text-textPrimary bg-white focus:border-primary text-xs font-bold select-all w-full"
                                  style={{ minHeight: 36 }}
                                  keyboardType="numeric"
                                />
                              </View>

                              {/* Port */}
                              <View className="w-full md:w-1/2 px-2 mb-3.5">
                                <Text className="text-[10px] font-bold text-textSecondary uppercase tracking-wider mb-1.5">Port</Text>
                                <TextInput
                                  value={String(formState.port)}
                                  onChangeText={(text) => setFormState(prev => ({ ...prev, port: Number(text) || 0 }))}
                                  placeholder="9100"
                                  placeholderTextColor="#94a3b8"
                                  className="border border-slate-200 rounded-xl px-3 py-1.5 text-textPrimary bg-white focus:border-primary text-xs font-bold select-all w-full"
                                  style={{ minHeight: 36 }}
                                  keyboardType="number-pad"
                                />
                              </View>

                              {/* Paper Width */}
                              <View className="w-full md:w-1/2 px-2 mb-3.5">
                                <Text className="text-[10px] font-bold text-textSecondary uppercase tracking-wider mb-1.5">Paper Width</Text>
                                <View className="flex-row gap-2">
                                  {['80mm', '58mm'].map((size) => {
                                    const isSelected = formState.paper_width === size;
                                    return (
                                      <Pressable
                                        key={size}
                                        className={`flex-1 border items-center justify-center ${
                                          isSelected 
                                            ? 'bg-[#f4f8fd] border-[#0D6CE0] text-primary' 
                                            : 'bg-white border-slate-200 text-textSecondary active:bg-slate-50'
                                        }`}
                                        style={({ pressed }) => [
                                          { height: 36, borderRadius: 8, borderWidth: isSelected ? 2 : 1 },
                                          pressed && { opacity: 0.9 }
                                        ]}
                                        onPress={() => setFormState(prev => ({ ...prev, paper_width: size }))}
                                      >
                                        <Text className={`font-extrabold text-[11px] ${isSelected ? 'text-[#0D6CE0]' : 'text-textSecondary'}`}>
                                          {size}
                                        </Text>
                                      </Pressable>
                                    );
                                  })}
                                </View>
                              </View>

                              {/* Status toggles with smaller scales & fonts */}
                              <View className="w-full md:w-1/2 px-2 mb-3.5">
                                <Text className="text-[10px] font-bold text-textSecondary uppercase tracking-wider mb-1.5">Status</Text>
                                <View className="flex-row gap-4 flex-wrap items-center mt-1">
                                  <View className="flex-row items-center gap-2.5">
                                    <Switch
                                      value={formState.is_active}
                                      onValueChange={(val) => setFormState(prev => ({ ...prev, is_active: val }))}
                                      trackColor={{ false: '#cbd5e1', true: '#0D6CE0' }}
                                      thumbColor={formState.is_active ? '#ffffff' : '#f4f3f4'}
                                      style={{ transform: [{ scale: 0.8 }] }}
                                    />
                                    <View>
                                      <Text className="text-[11px] font-extrabold text-textPrimary">Active</Text>
                                      <Text className="text-[9px] font-semibold text-textSecondary mt-0.5">
                                        Inactive printers will not print.
                                      </Text>
                                    </View>
                                  </View>

                                  <View className="flex-row items-center gap-2.5">
                                    <Switch
                                      value={formState.is_default}
                                      onValueChange={(val) => setFormState(prev => ({ ...prev, is_default: val }))}
                                      trackColor={{ false: '#cbd5e1', true: '#0D6CE0' }}
                                      thumbColor={formState.is_default ? '#ffffff' : '#f4f3f4'}
                                      style={{ transform: [{ scale: 0.8 }] }}
                                    />
                                    <View>
                                      <Text className="text-[11px] font-extrabold text-textPrimary">Default Printer</Text>
                                      <Text className="text-[9px] font-semibold text-textSecondary mt-0.5">
                                        Primary billing printer.
                                      </Text>
                                    </View>
                                  </View>
                                </View>
                              </View>
                            </View>

                            {/* Accordion form actions - scaled down height & padding */}
                            <View className="flex-row border-t border-slate-100 pt-3.5 mt-3.5 justify-between flex-wrap gap-2.5 items-center">
                              <Pressable
                                style={({ pressed }) => [
                                  { height: 34 },
                                  pressed && { opacity: 0.85 }
                                ]}
                                className="px-4 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 active:bg-rose-200 flex-row gap-1.5 items-center justify-center"
                                onPress={() => handleDelete(printer.id)}
                              >
                                <Trash2 size={12} color="#dc2626" />
                                <Text className="font-extrabold text-rose-700 text-[11px]">Delete Printer</Text>
                              </Pressable>

                              <View className="flex-row gap-2.5">
                                <Pressable
                                  className="px-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 active:bg-slate-100 items-center justify-center flex-row gap-1.5"
                                  style={({ pressed }) => [pressed && { opacity: 0.9 }, { height: 34 }]}
                                  onPress={handleTestConnection}
                                  disabled={testing || submitting}
                                >
                                  {testing ? (
                                    <ActivityIndicator size="small" color={colors.primary} style={{ transform: [{ scale: 0.7 }] }} />
                                  ) : (
                                    <Text className="font-extrabold text-slate-700 text-[11px]">Test Connection</Text>
                                  )}
                                </Pressable>

                                <Pressable
                                  className="px-5 rounded-xl bg-primary hover:bg-primaryDeep active:bg-primaryDeep items-center justify-center flex-row gap-1.5"
                                  style={({ pressed }) => [pressed && { opacity: 0.9 }, { height: 34 }]}
                                  onPress={handleSave}
                                  disabled={testing || submitting}
                                >
                                  {submitting ? (
                                    <ActivityIndicator size="small" color="white" style={{ transform: [{ scale: 0.7 }] }} />
                                  ) : (
                                    <Text className="font-extrabold text-white text-[11px]">Save Changes</Text>
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
                    <View className="bg-white rounded-xl border border-primary shadow-xs overflow-hidden animate-fade-in">
                      <View className="p-3 bg-slate-50 flex-row justify-between items-center border-b border-slate-200">
                        <View className="flex-row items-center gap-1.5">
                          <PrinterIcon size={14} color={colors.primary} />
                          <Text className="font-black text-slate-800 text-xs">Add Another Printer</Text>
                        </View>
                        <Pressable 
                          onPress={handleCancelNew}
                          className="px-3 py-1 rounded-lg border border-slate-200 bg-white active:bg-slate-50"
                        >
                          <Text className="text-[9px] font-black text-slate-500 uppercase">Cancel</Text>
                        </Pressable>
                      </View>

                      <View className="p-4">
                        {formError && (
                          <View className="flex-row items-center gap-2 bg-red-50 p-2.5 border border-red-200 rounded-xl mb-4">
                            <AlertCircle size={16} color="#dc2626" />
                            <Text className="text-red-700 font-bold flex-1 text-xs">{formError}</Text>
                          </View>
                        )}

                        <View className="flex-row flex-wrap -mx-2">
                          {/* Printer Name */}
                          <View className="w-full md:w-1/2 px-2 mb-3.5">
                            <Text className="text-[10px] font-bold text-textSecondary uppercase tracking-wider mb-1.5">Printer Name</Text>
                            <TextInput
                              value={formState.name}
                              onChangeText={(text) => setFormState(prev => ({ ...prev, name: text }))}
                              placeholder="e.g. Kitchen Printer"
                              placeholderTextColor="#94a3b8"
                              className="border border-slate-200 rounded-xl px-3 py-1.5 text-textPrimary bg-slate-50 focus:bg-white text-xs font-bold select-all w-full"
                              style={{ minHeight: 36 }}
                            />
                          </View>

                          {/* Printer Role */}
                          <View className="w-full md:w-1/2 px-2 mb-3.5">
                            <Text className="text-[10px] font-bold text-textSecondary uppercase tracking-wider mb-1.5">Printer Role</Text>
                            <View className="flex-row gap-2">
                              {[
                                { value: 'bill', label: 'Bill Printer' },
                                { value: 'kitchen', label: 'Kitchen Printer' }
                              ].map((role) => {
                                const isSelected = formState.printer_role === role.value;
                                return (
                                  <Pressable
                                    key={role.value}
                                    className={`flex-1 border items-center justify-center ${
                                      isSelected 
                                        ? 'bg-[#f4f8fd] border-[#0D6CE0] text-primary' 
                                        : 'bg-slate-50 border-slate-200 text-textSecondary active:bg-slate-100'
                                    }`}
                                    style={({ pressed }) => [
                                      { height: 36, borderRadius: 8, borderWidth: isSelected ? 2 : 1 },
                                      pressed && { opacity: 0.9 }
                                    ]}
                                    onPress={() => setFormState(prev => ({ ...prev, printer_role: role.value }))}
                                  >
                                    <Text className={`font-extrabold text-[11px] ${isSelected ? 'text-[#0D6CE0]' : 'text-textSecondary'}`}>
                                      {role.label}
                                    </Text>
                                  </Pressable>
                                );
                              })}
                            </View>
                          </View>

                          {/* IP Address */}
                          <View className="w-full md:w-1/2 px-2 mb-3.5">
                            <Text className="text-[10px] font-bold text-textSecondary uppercase tracking-wider mb-1.5">IP Address</Text>
                            <TextInput
                              value={formState.ip_address ?? ''}
                              onChangeText={(text) => setFormState(prev => ({ ...prev, ip_address: text }))}
                              placeholder="e.g. 192.168.1.107"
                              placeholderTextColor="#94a3b8"
                              className="border border-slate-200 rounded-xl px-3 py-1.5 text-textPrimary bg-slate-50 focus:bg-white text-xs font-bold select-all w-full"
                              style={{ minHeight: 36 }}
                              keyboardType="numeric"
                            />
                          </View>

                          {/* Port */}
                          <View className="w-full md:w-1/2 px-2 mb-3.5">
                            <Text className="text-[10px] font-bold text-textSecondary uppercase tracking-wider mb-1.5">Port</Text>
                            <TextInput
                              value={String(formState.port)}
                              onChangeText={(text) => setFormState(prev => ({ ...prev, port: Number(text) || 0 }))}
                              placeholder="9100"
                              placeholderTextColor="#94a3b8"
                              className="border border-slate-200 rounded-xl px-3 py-1.5 text-textPrimary bg-slate-50 focus:bg-white text-xs font-bold select-all w-full"
                              style={{ minHeight: 36 }}
                              keyboardType="number-pad"
                            />
                          </View>

                          {/* Paper Width */}
                          <View className="w-full md:w-1/2 px-2 mb-3.5">
                            <Text className="text-[10px] font-bold text-textSecondary uppercase tracking-wider mb-1.5">Paper Width</Text>
                            <View className="flex-row gap-2">
                              {['80mm', '58mm'].map((size) => {
                                const isSelected = formState.paper_width === size;
                                return (
                                  <Pressable
                                    key={size}
                                    className={`flex-1 border items-center justify-center ${
                                      isSelected 
                                        ? 'bg-[#f4f8fd] border-[#0D6CE0] text-primary' 
                                        : 'bg-slate-50 border-slate-200 text-textSecondary active:bg-slate-100'
                                    }`}
                                    style={({ pressed }) => [
                                      { height: 36, borderRadius: 8, borderWidth: isSelected ? 2 : 1 },
                                      pressed && { opacity: 0.9 }
                                    ]}
                                    onPress={() => setFormState(prev => ({ ...prev, paper_width: size }))}
                                  >
                                    <Text className={`font-extrabold text-[11px] ${isSelected ? 'text-[#0D6CE0]' : 'text-textSecondary'}`}>
                                      {size}
                                    </Text>
                                  </Pressable>
                                );
                              })}
                            </View>
                          </View>

                          {/* Switches */}
                          <View className="w-full px-2 mb-2 flex-row gap-5 mt-1 flex-wrap">
                            <View className="flex-row items-center gap-2">
                              <Switch
                                value={formState.is_default}
                                onValueChange={(val) => setFormState(prev => ({ ...prev, is_default: val }))}
                                trackColor={{ false: '#cbd5e1', true: '#0D6CE0' }}
                                thumbColor={formState.is_default ? '#ffffff' : '#f4f3f4'}
                                style={{ transform: [{ scale: 0.8 }] }}
                              />
                              <Text className="text-[11px] font-extrabold text-textPrimary">Default Printer</Text>
                            </View>

                            <View className="flex-row items-center gap-2">
                              <Switch
                                value={formState.is_active}
                                onValueChange={(val) => setFormState(prev => ({ ...prev, is_active: val }))}
                                trackColor={{ false: '#cbd5e1', true: '#0D6CE0' }}
                                thumbColor={formState.is_active ? '#ffffff' : '#f4f3f4'}
                                style={{ transform: [{ scale: 0.8 }] }}
                              />
                              <Text className="text-[11px] font-extrabold text-textPrimary">Active</Text>
                            </View>
                          </View>
                        </View>

                        {/* Actions */}
                        <View className="flex-row gap-2.5 border-t border-slate-200 pt-3.5 mt-3.5 justify-end flex-wrap">
                          <Pressable
                            className="px-4 rounded-xl border border-slate-200 bg-white active:bg-slate-50 items-center justify-center flex-row gap-1.5"
                            style={({ pressed }) => [pressed && { opacity: 0.9 }, { height: 34 }]}
                            onPress={handleTestConnection}
                            disabled={testing || submitting}
                          >
                            {testing ? (
                              <ActivityIndicator size="small" color={colors.primary} style={{ transform: [{ scale: 0.7 }] }} />
                            ) : (
                              <Text className="font-extrabold text-slate-700 text-[11px]">Test Connection</Text>
                            )}
                          </Pressable>

                          <Pressable
                            className="px-5 rounded-xl bg-primary active:opacity-90 items-center justify-center flex-row gap-1.5"
                            style={({ pressed }) => [pressed && { opacity: 0.9 }, { height: 34 }]}
                            onPress={handleSave}
                            disabled={testing || submitting}
                          >
                            {submitting ? (
                              <ActivityIndicator size="small" color="white" style={{ transform: [{ scale: 0.7 }] }} />
                            ) : (
                              <Text className="font-extrabold text-white text-[11px]">Save Settings</Text>
                            )}
                          </Pressable>
                        </View>
                      </View>
                    </View>
                  ) : (
                    <Pressable
                      onPress={handleStartNew}
                      className="bg-white border border-dashed border-slate-300 py-2.5 rounded-xl flex-row items-center justify-center gap-1.5 active:bg-slate-50"
                    >
                      <Plus size={14} color={colors.primary} />
                      <Text className="text-[10px] font-black text-slate-600 uppercase tracking-wider">+ Add Another Printer</Text>
                    </Pressable>
                  )}
                </>
              )}
            </View>
          </ScrollView>
        ) : activeTab === 'system' ? (
          <ScrollView className="flex-1 bg-white border border-slate-200 rounded-xl p-4 shadow-xs animate-fade-in" showsVerticalScrollIndicator={false}>
            <View className="flex-row items-center gap-3 border-b border-slate-100 pb-3 mb-4">
              <View className="p-2 bg-accentSoft rounded-xl">
                <Settings size={18} color={colors.primary} />
              </View>
              <View>
                <Text className="text-sm font-black text-textPrimary">System Settings</Text>
                <Text className="text-[10px] text-textSecondary font-semibold">General configurations and restaurant operations metadata</Text>
              </View>
            </View>

            <View className="flex-row flex-wrap -mx-2 gap-y-3.5">
              <View className="w-full md:w-1/2 px-2">
                <View className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <Text className="text-[9px] font-bold text-textSecondary uppercase tracking-wider mb-1">POS Brand</Text>
                  <Text className="text-sm font-black text-slate-800">{brand.name}</Text>
                  <Text className="text-[10px] text-textSecondary font-semibold mt-0.5">{brand.tagline}</Text>
                </View>
              </View>

              <View className="w-full md:w-1/2 px-2">
                <View className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <Text className="text-[9px] font-bold text-textSecondary uppercase tracking-wider mb-1">Active Currency</Text>
                  <Text className="text-sm font-black text-slate-800">INR (₹)</Text>
                  <Text className="text-[10px] text-textSecondary font-semibold mt-0.5">Official restaurant transactions and accounting currency.</Text>
                </View>
              </View>

              <View className="w-full md:w-1/2 px-2">
                <View className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <Text className="text-[9px] font-bold text-textSecondary uppercase tracking-wider mb-1">Thermal Receipt Format</Text>
                  <Text className="text-sm font-black text-slate-800">ESC/POS (Network IP)</Text>
                  <Text className="text-[10px] text-textSecondary font-semibold mt-0.5">Raw character printer streams and immediate spool cuts.</Text>
                </View>
              </View>

              <View className="w-full md:w-1/2 px-2">
                <View className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <Text className="text-[9px] font-bold text-textSecondary uppercase tracking-wider mb-1">Local Bridge Endpoint</Text>
                  <Text className="text-sm font-black text-[#0D6CE0] select-all">http://localhost:3210</Text>
                  <Text className="text-[10px] text-textSecondary font-semibold mt-0.5">Production endpoint of the Grovit Print Agent interface.</Text>
                </View>
              </View>
            </View>
          </ScrollView>
        ) : (
          <MenuManagement onBack={() => setActiveTab('printers')} />
        )}
      </View>
    </View>
  );
}
