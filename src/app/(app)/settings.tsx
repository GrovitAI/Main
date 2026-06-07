import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, TextInput, ActivityIndicator, Switch, Platform, ScrollView } from 'react-native';
import { Printer as PrinterIcon, Plus, Trash2, Check, AlertCircle, Settings, ChevronDown, ChevronUp, Wifi, BookOpen } from 'lucide-react-native';
import { colors, brand } from '@/lib/pos/brand';
import { fetchPrinters, savePrinter, deletePrinter, type Printer } from '@/lib/pos/printer-db-service';
import { printerService, diagnosePrinterConnection } from '@/lib/printer/printer-service';
import { checkAgentHealth } from '@/lib/printer/print-agent-service';
import { getPrinters } from '@/services/printService';
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

  // Local Print Agent Spooler states
  const [localPrinters, setLocalPrinters] = useState<string[]>([]);
  const [loadingLocalPrinters, setLoadingLocalPrinters] = useState(false);
  const [selectedLocalPrinter, setSelectedLocalPrinter] = useState<string | null>(null);
  const [showPrinterDropdown, setShowPrinterDropdown] = useState(false);

  // Accordion state
  const [expandedPrinterId, setExpandedPrinterId] = useState<string | null>(null);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [formState, setFormState] = useState<PrinterFormState>(initialFormState);

  // Connectivity status of the expanded printer
  const [connStatus, setConnStatus] = useState<'connected' | 'unreachable' | 'offline' | 'checking'>('checking');

  const fetchLocalPrintersList = async () => {
    setLoadingLocalPrinters(true);
    try {
      const list = await getPrinters();
      setLocalPrinters(list);
    } catch (err) {
      console.warn('Failed to load local printers:', err);
      setLocalPrinters([]);
    } finally {
      setLoadingLocalPrinters(false);
    }
  };

  const checkAgentStatus = async () => {
    setCheckingAgent(true);
    try {
      const online = await checkAgentHealth();
      setAgentOnline(online);
      if (online) {
        setLoadingLocalPrinters(true);
        const list = await getPrinters();
        setLocalPrinters(list);
        setLoadingLocalPrinters(false);
      }
    } catch {
      setAgentOnline(false);
    } finally {
      setCheckingAgent(false);
    }
  };

  const handleSelectLocalPrinter = (printerName: string | null) => {
    setSelectedLocalPrinter(printerName);
    if (typeof window !== 'undefined' && window.localStorage) {
      if (printerName) {
        window.localStorage.setItem('billingPrinter', printerName);
      } else {
        window.localStorage.removeItem('billingPrinter');
      }
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
    if (typeof window !== 'undefined' && window.localStorage) {
      const stored = window.localStorage.getItem('billingPrinter');
      setSelectedLocalPrinter(stored);
    }
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
    <View style={{ flex: 1, backgroundColor: '#F8FAFC' }}>
      {/* Modern Premium Page Header */}
      <View style={{
        paddingHorizontal: 28,
        paddingTop: Platform.OS === 'ios' ? 44 : 24,
        paddingBottom: 20,
        backgroundColor: '#F8FAFC',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottomWidth: 1,
        borderBottomColor: '#F1F5F9',
        marginBottom: 24,
      }}>
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text style={{
            fontSize: 32,
            fontWeight: '600',
            color: '#0F172A',
            fontFamily: 'Outfit, "Avenir Next", system-ui, sans-serif',
            letterSpacing: -0.8
          }}>
            Settings
          </Text>
          <Text style={{
            fontSize: 14,
            fontWeight: '500',
            color: '#64748B',
            marginTop: 4,
            opacity: 0.95
          }}>
            Manage operational and system preferences
          </Text>
        </View>

        {/* Right side branch context badge */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View className="bg-white border border-slate-200/80 px-3.5 py-2 rounded-xl shadow-xs flex-row items-center gap-2">
            <View className="w-2 h-2 rounded-full bg-emerald-500" />
            <Text className="text-xs font-bold text-slate-700">Le Leban POS Main</Text>
          </View>
        </View>
      </View>

      {/* Main Container with generous SaaS padding */}
      <View className="flex-1 px-8">
        
        {/* Segmented SaaS Navigation Tab Bar */}
        <View className="flex-row bg-slate-100/90 p-1 rounded-2xl mb-8 shadow-xs border border-slate-200/60 self-start">
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
                className={`flex-row items-center gap-2 px-5 py-2.5 rounded-xl transition-all cursor-pointer ${
                  isSel ? 'bg-white shadow-xs border border-slate-200/60' : 'bg-transparent active:bg-slate-200/30'
                }`}
                style={isSel ? { elevation: 1 } : {}}
              >
                <Icon size={14} color={isSel ? '#0F172A' : '#64748B'} />
                <Text className={`text-xs font-bold ${isSel ? 'text-[#0F172A]' : 'text-[#64748B]'}`}>
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {activeTab === 'printers' ? (
          <ScrollView className="flex-1" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 130 }}>
            
            {/* Local Print Agent Profile Card */}
            <View className="bg-white border border-slate-200/80 p-5 rounded-2xl mb-6 shadow-xs gap-4">
              <View className="flex-row items-center justify-between flex-wrap gap-4">
                <View className="flex-row items-center gap-3.5">
                  <View className="p-2.5 bg-slate-50 border border-slate-100 rounded-xl w-11 h-11 items-center justify-center">
                    <PrinterIcon size={18} color="#0F172A" />
                  </View>
                  <View>
                    <Text className="text-base font-bold text-[#0F172A]">Local Print Agent</Text>
                    <Text className="text-xs text-slate-500 mt-0.5 leading-relaxed">Direct IP network printing via local print agent bridge.</Text>
                  </View>
                </View>

                {/* Status indicator */}
                <Pressable 
                  onPress={checkAgentStatus}
                  className="flex-row items-center gap-2 bg-slate-50 border border-slate-200 px-3.5 py-1.5 rounded-xl active:bg-slate-100"
                >
                  <Text className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Agent Status</Text>
                  {checkingAgent ? (
                    <ActivityIndicator size="small" color="#0F172A" style={{ transform: [{ scale: 0.65 }] }} />
                  ) : agentOnline === true ? (
                    <View className="bg-emerald-50 border border-emerald-200/50 px-2.5 py-0.5 rounded-full flex-row items-center gap-1">
                      <View className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      <Text className="text-emerald-700 text-[9px] font-black uppercase">Online</Text>
                    </View>
                  ) : (
                    <View className="bg-rose-50 border border-rose-200/50 px-2.5 py-0.5 rounded-full flex-row items-center gap-1">
                      <View className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                      <Text className="text-rose-700 text-[9px] font-black uppercase">Offline</Text>
                    </View>
                  )}
                </Pressable>
              </View>

              {/* Printer selection dropdown if agent is online */}
              {agentOnline === true && (
                <View className="border-t border-slate-100 pt-4 mt-1">
                  <Text className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Active Local Spooler / OS Printer</Text>
                  
                  {loadingLocalPrinters ? (
                    <View className="flex-row items-center gap-2 py-2">
                      <ActivityIndicator size="small" color="#0F172A" />
                      <Text className="text-xs text-slate-500 font-semibold">Retrieving system printers...</Text>
                    </View>
                  ) : localPrinters.length === 0 ? (
                    <View className="bg-amber-50 border border-amber-200 p-3.5 rounded-xl flex-row items-center gap-2.5">
                      <AlertCircle size={15} color="#d97706" />
                      <Text className="text-xs font-bold text-amber-700 flex-1">
                        No OS printers found. Please ensure printers are installed on this device.
                      </Text>
                    </View>
                  ) : (
                    <View className="flex-row items-center gap-3">
                      <View className="flex-1 relative" style={{ zIndex: 999 }}>
                        {/* Selector UI (Dropdown) */}
                        <Pressable 
                          onPress={() => setShowPrinterDropdown(!showPrinterDropdown)}
                          className="flex-row items-center justify-between border border-slate-200 rounded-xl px-4 py-2 bg-white"
                          style={{ minHeight: 40 }}
                        >
                          <Text className={`text-xs font-bold ${selectedLocalPrinter ? 'text-[#0F172A]' : 'text-slate-400'}`}>
                            {selectedLocalPrinter || 'Select a system printer...'}
                          </Text>
                          <ChevronDown size={14} color="#64748B" />
                        </Pressable>

                        {showPrinterDropdown && (
                          <View 
                            className="absolute left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden max-h-48"
                            style={{ top: '100%', elevation: 10, zIndex: 1000 }}
                          >
                            <ScrollView nestedScrollEnabled>
                              {localPrinters.map((printerName) => {
                                const isSelected = selectedLocalPrinter === printerName;
                                return (
                                  <Pressable
                                    key={printerName}
                                    onPress={() => {
                                      handleSelectLocalPrinter(printerName);
                                      setShowPrinterDropdown(false);
                                    }}
                                    className={`px-4 py-2.5 flex-row items-center justify-between active:bg-slate-50 ${
                                      isSelected ? 'bg-slate-50' : ''
                                    }`}
                                  >
                                    <Text className={`text-xs font-bold ${isSelected ? 'text-[#0F172A]' : 'text-slate-600'}`}>
                                      {printerName}
                                    </Text>
                                    {isSelected && <Check size={14} color="#0F172A" />}
                                  </Pressable>
                                );
                              })}
                            </ScrollView>
                          </View>
                        )}
                      </View>

                      {selectedLocalPrinter ? (
                        <Pressable 
                          onPress={() => handleSelectLocalPrinter(null)}
                          className="px-4 py-2 border border-rose-200 bg-rose-50 rounded-xl active:bg-rose-100 h-10 items-center justify-center flex-row gap-1.5"
                        >
                          <Trash2 size={13} color="#dc2626" />
                          <Text className="text-[11px] font-extrabold text-rose-700">Clear</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  )}
                </View>
              )}
            </View>

            {/* Collapsible accordion network configurations stream */}
            <View className="gap-4 w-full">
              {loading ? (
                <View className="items-center justify-center py-12 bg-white rounded-2xl border border-slate-200/80 shadow-xs">
                  <ActivityIndicator size="large" color="#0F172A" />
                </View>
              ) : (
                <>
                  {printers.map((printer) => {
                    const isExpanded = expandedPrinterId === printer.id;
                    return (
                      <View 
                        key={printer.id} 
                        className={`bg-white rounded-2xl border transition-all ${
                          isExpanded ? 'border-slate-300 shadow-sm' : 'border-slate-200/80 shadow-xs'
                        }`}
                      >
                        {/* Accordion header - Scaled down padding & spacing */}
                        <Pressable
                          onPress={() => isExpanded ? handleCollapsePrinter() : handleExpandPrinter(printer)}
                          className="flex-row items-center justify-between p-4.5 flex-wrap gap-2"
                        >
                          <View className="flex-row items-center gap-3.5 flex-1 min-w-[260px]">
                            <Wifi size={16} color={printer.is_active ? '#0F172A' : '#94A3B8'} />
                            <View className="flex-row items-center gap-2.5 flex-wrap">
                              <Text className="font-bold text-[#0F172A] text-sm">{printer.name}</Text>
                              <Text className="text-xs text-slate-500 font-semibold">
                                {printer.printer_role === 'bill' ? 'Bill Printer' : 'Kitchen Printer'} • {printer.ip_address}:{printer.port}
                              </Text>
                              {isExpanded && renderStatusBadge(connStatus)}
                            </View>
                          </View>

                          {/* Collapse button style matching the mockup */}
                          <View className="flex-row items-center gap-1.5 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl">
                            <Text className="text-slate-600 text-[10px] font-bold uppercase tracking-wider">
                              {isExpanded ? 'Collapse' : 'Expand'}
                            </Text>
                            {isExpanded ? <ChevronUp size={12} color="#64748b" /> : <ChevronDown size={12} color="#64748b" />}
                          </View>
                        </Pressable>

                        {/* Accordion body form */}
                        {isExpanded && (
                          <View className="border-t border-slate-100 p-6 bg-white rounded-b-2xl">
                            {formError && (
                              <View className="flex-row items-center gap-2 bg-rose-50 p-3 border border-rose-200 rounded-xl mb-5">
                                <AlertCircle size={16} color="#dc2626" />
                                <Text className="text-rose-700 font-bold flex-1 text-xs">{formError}</Text>
                              </View>
                            )}

                            {successMsg && (
                              <View className="flex-row items-center gap-2 bg-emerald-50 p-3 border border-emerald-200 rounded-xl mb-5">
                                <Check size={16} color="#15803d" />
                                <Text className="text-emerald-700 font-bold flex-1 text-xs">{successMsg}</Text>
                              </View>
                            )}

                            {/* 2-column input grid with reduced margins & text inputs */}
                            <View className="flex-row flex-wrap -mx-2.5">
                              {/* Printer Name */}
                              <View className="w-full md:w-1/2 px-2.5 mb-4">
                                <Text className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Printer Name</Text>
                                <TextInput
                                  value={formState.name}
                                  onChangeText={(text) => setFormState(prev => ({ ...prev, name: text }))}
                                  placeholder="e.g. Counter Cashier"
                                  placeholderTextColor="#94a3b8"
                                  className="border border-slate-200 rounded-xl px-4 py-2 text-slate-800 bg-white focus:border-slate-400 text-xs font-bold select-all w-full"
                                  style={{ minHeight: 40 }}
                                />
                              </View>

                              {/* Printer Role */}
                              <View className="w-full md:w-1/2 px-2.5 mb-4">
                                <Text className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Printer Role</Text>
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
                                            ? 'bg-slate-900 border-slate-900 text-white' 
                                            : 'bg-white border-slate-200 text-slate-600 active:bg-slate-50'
                                        }`}
                                        style={({ pressed }) => [
                                          { height: 40, borderRadius: 12, borderWidth: 1 },
                                          pressed && { opacity: 0.9 }
                                        ]}
                                        onPress={() => setFormState(prev => ({ ...prev, printer_role: role.value }))}
                                      >
                                        <Text className={`font-extrabold text-[11px] ${isSelected ? 'text-white' : 'text-slate-600'}`}>
                                          {role.label}
                                        </Text>
                                      </Pressable>
                                    );
                                  })}
                                </View>
                              </View>

                              {/* IP Address */}
                              <View className="w-full md:w-1/2 px-2.5 mb-4">
                                <Text className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">IP Address</Text>
                                <TextInput
                                  value={formState.ip_address ?? ''}
                                  onChangeText={(text) => setFormState(prev => ({ ...prev, ip_address: text }))}
                                  placeholder="e.g. 192.168.1.100"
                                  placeholderTextColor="#94a3b8"
                                  className="border border-slate-200 rounded-xl px-4 py-2 text-slate-800 bg-white focus:border-slate-400 text-xs font-bold select-all w-full"
                                  style={{ minHeight: 40 }}
                                  keyboardType="numeric"
                                />
                              </View>

                              {/* Port */}
                              <View className="w-full md:w-1/2 px-2.5 mb-4">
                                <Text className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Port</Text>
                                <TextInput
                                  value={String(formState.port)}
                                  onChangeText={(text) => setFormState(prev => ({ ...prev, port: Number(text) || 0 }))}
                                  placeholder="9100"
                                  placeholderTextColor="#94a3b8"
                                  className="border border-slate-200 rounded-xl px-4 py-2 text-slate-800 bg-white focus:border-slate-400 text-xs font-bold select-all w-full"
                                  style={{ minHeight: 40 }}
                                  keyboardType="number-pad"
                                />
                              </View>

                              {/* Paper Width */}
                              <View className="w-full md:w-1/2 px-2.5 mb-4">
                                <Text className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Paper Width</Text>
                                <View className="flex-row gap-2">
                                  {['80mm', '58mm'].map((size) => {
                                    const isSelected = formState.paper_width === size;
                                    return (
                                      <Pressable
                                        key={size}
                                        className={`flex-1 border items-center justify-center ${
                                          isSelected 
                                            ? 'bg-slate-900 border-slate-900 text-white' 
                                            : 'bg-white border-slate-200 text-slate-600 active:bg-slate-50'
                                        }`}
                                        style={({ pressed }) => [
                                          { height: 40, borderRadius: 12, borderWidth: 1 },
                                          pressed && { opacity: 0.9 }
                                        ]}
                                        onPress={() => setFormState(prev => ({ ...prev, paper_width: size }))}
                                      >
                                        <Text className={`font-extrabold text-[11px] ${isSelected ? 'text-white' : 'text-slate-600'}`}>
                                          {size}
                                        </Text>
                                      </Pressable>
                                    );
                                  })}
                                </View>
                              </View>

                              {/* Status toggles with smaller scales & fonts */}
                              <View className="w-full md:w-1/2 px-2.5 mb-4">
                                <Text className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Operational Status</Text>
                                <View className="flex-row gap-5 flex-wrap items-center mt-2.5">
                                  <View className="flex-row items-center gap-2.5">
                                    <Switch
                                      value={formState.is_active}
                                      onValueChange={(val) => setFormState(prev => ({ ...prev, is_active: val }))}
                                      trackColor={{ false: '#cbd5e1', true: '#0F172A' }}
                                      thumbColor={formState.is_active ? '#ffffff' : '#f4f3f4'}
                                      style={{ transform: [{ scale: 0.8 }] }}
                                    />
                                    <View>
                                      <Text className="text-[11px] font-extrabold text-slate-800">Active Printer</Text>
                                    </View>
                                  </View>

                                  <View className="flex-row items-center gap-2.5">
                                    <Switch
                                      value={formState.is_default}
                                      onValueChange={(val) => setFormState(prev => ({ ...prev, is_default: val }))}
                                      trackColor={{ false: '#cbd5e1', true: '#0F172A' }}
                                      thumbColor={formState.is_default ? '#ffffff' : '#f4f3f4'}
                                      style={{ transform: [{ scale: 0.8 }] }}
                                    />
                                    <View>
                                      <Text className="text-[11px] font-extrabold text-slate-800">Primary (Default)</Text>
                                    </View>
                                  </View>
                                </View>
                              </View>
                            </View>

                            {/* Accordion form actions - scaled down height & padding */}
                            <View className="flex-row border-t border-slate-100 pt-4.5 mt-4 justify-between flex-wrap gap-2.5 items-center">
                              <Pressable
                                style={({ pressed }) => [
                                  { height: 36 },
                                  pressed && { opacity: 0.85 }
                                ]}
                                className="px-4.5 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 active:bg-rose-200 flex-row gap-1.5 items-center justify-center"
                                onPress={() => handleDelete(printer.id)}
                              >
                                <Trash2 size={13} color="#dc2626" />
                                <Text className="font-extrabold text-rose-700 text-[11px]">Delete Printer</Text>
                              </Pressable>

                              <View className="flex-row gap-2.5">
                                <Pressable
                                  className="px-4.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 active:bg-slate-100 items-center justify-center flex-row gap-1.5"
                                  style={({ pressed }) => [pressed && { opacity: 0.9 }, { height: 36 }]}
                                  onPress={handleTestConnection}
                                  disabled={testing || submitting}
                                >
                                  {testing ? (
                                    <ActivityIndicator size="small" color="#0F172A" style={{ transform: [{ scale: 0.7 }] }} />
                                  ) : (
                                    <Text className="font-extrabold text-slate-700 text-[11px]">Test Connection</Text>
                                  )}
                                </Pressable>

                                <Pressable
                                  className="px-5.5 rounded-xl bg-slate-900 hover:bg-slate-800 active:bg-slate-850 items-center justify-center flex-row gap-1.5"
                                  style={({ pressed }) => [pressed && { opacity: 0.9 }, { height: 36 }]}
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
                    <View className="bg-white rounded-2xl border border-slate-300 shadow-sm overflow-hidden">
                      <View className="p-4 bg-slate-50 flex-row justify-between items-center border-b border-slate-200/80">
                        <View className="flex-row items-center gap-1.5">
                          <PrinterIcon size={14} color="#0F172A" />
                          <Text className="font-bold text-slate-800 text-xs">Add Another Printer</Text>
                        </View>
                        <Pressable 
                          onPress={handleCancelNew}
                          className="px-3.5 py-1.5 rounded-lg border border-slate-200 bg-white active:bg-slate-50"
                        >
                          <Text className="text-[9px] font-black text-slate-500 uppercase">Cancel</Text>
                        </Pressable>
                      </View>

                      <View className="p-6">
                        {formError && (
                          <View className="flex-row items-center gap-2 bg-rose-50 p-3 border border-rose-200 rounded-xl mb-5">
                            <AlertCircle size={16} color="#dc2626" />
                            <Text className="text-rose-700 font-bold flex-1 text-xs">{formError}</Text>
                          </View>
                        )}

                        <View className="flex-row flex-wrap -mx-2.5">
                          {/* Printer Name */}
                          <View className="w-full md:w-1/2 px-2.5 mb-4">
                            <Text className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Printer Name</Text>
                            <TextInput
                              value={formState.name}
                              onChangeText={(text) => setFormState(prev => ({ ...prev, name: text }))}
                              placeholder="e.g. Kitchen Output"
                              placeholderTextColor="#94a3b8"
                              className="border border-slate-200 rounded-xl px-4 py-2 text-slate-800 bg-white focus:border-slate-400 text-xs font-bold select-all w-full"
                              style={{ minHeight: 40 }}
                            />
                          </View>

                          {/* Printer Role */}
                          <View className="w-full md:w-1/2 px-2.5 mb-4">
                            <Text className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Printer Role</Text>
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
                                        ? 'bg-slate-900 border-slate-900 text-white' 
                                        : 'bg-white border-slate-200 text-slate-600 active:bg-slate-50'
                                    }`}
                                    style={({ pressed }) => [
                                      { height: 40, borderRadius: 12, borderWidth: 1 },
                                      pressed && { opacity: 0.9 }
                                    ]}
                                    onPress={() => setFormState(prev => ({ ...prev, printer_role: role.value }))}
                                  >
                                    <Text className={`font-extrabold text-[11px] ${isSelected ? 'text-white' : 'text-slate-600'}`}>
                                      {role.label}
                                    </Text>
                                  </Pressable>
                                );
                              })}
                            </View>
                          </View>

                          {/* IP Address */}
                          <View className="w-full md:w-1/2 px-2.5 mb-4">
                            <Text className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">IP Address</Text>
                            <TextInput
                              value={formState.ip_address ?? ''}
                              onChangeText={(text) => setFormState(prev => ({ ...prev, ip_address: text }))}
                              placeholder="e.g. 192.168.1.101"
                              placeholderTextColor="#94a3b8"
                              className="border border-slate-200 rounded-xl px-4 py-2 text-slate-800 bg-white focus:border-slate-400 text-xs font-bold select-all w-full"
                              style={{ minHeight: 40 }}
                              keyboardType="numeric"
                            />
                          </View>

                          {/* Port */}
                          <View className="w-full md:w-1/2 px-2.5 mb-4">
                            <Text className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Port</Text>
                            <TextInput
                              value={String(formState.port)}
                              onChangeText={(text) => setFormState(prev => ({ ...prev, port: Number(text) || 0 }))}
                              placeholder="9100"
                              placeholderTextColor="#94a3b8"
                              className="border border-slate-200 rounded-xl px-4 py-2 text-slate-800 bg-white focus:border-slate-400 text-xs font-bold select-all w-full"
                              style={{ minHeight: 40 }}
                              keyboardType="number-pad"
                            />
                          </View>

                          {/* Paper Width */}
                          <View className="w-full md:w-1/2 px-2.5 mb-4">
                            <Text className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Paper Width</Text>
                            <View className="flex-row gap-2">
                              {['80mm', '58mm'].map((size) => {
                                const isSelected = formState.paper_width === size;
                                return (
                                  <Pressable
                                    key={size}
                                    className={`flex-1 border items-center justify-center ${
                                      isSelected 
                                        ? 'bg-slate-900 border-slate-900 text-white' 
                                        : 'bg-white border-slate-200 text-slate-600 active:bg-slate-50'
                                    }`}
                                    style={({ pressed }) => [
                                      { height: 40, borderRadius: 12, borderWidth: 1 },
                                      pressed && { opacity: 0.9 }
                                    ]}
                                    onPress={() => setFormState(prev => ({ ...prev, paper_width: size }))}
                                  >
                                    <Text className={`font-extrabold text-[11px] ${isSelected ? 'text-white' : 'text-slate-600'}`}>
                                      {size}
                                    </Text>
                                  </Pressable>
                                );
                              })}
                            </View>
                          </View>

                          {/* Switches */}
                          <View className="w-full px-2.5 mb-2 flex-row gap-5 mt-1 flex-wrap">
                            <View className="flex-row items-center gap-2">
                              <Switch
                                value={formState.is_default}
                                onValueChange={(val) => setFormState(prev => ({ ...prev, is_default: val }))}
                                trackColor={{ false: '#cbd5e1', true: '#0F172A' }}
                                thumbColor={formState.is_default ? '#ffffff' : '#f4f3f4'}
                                style={{ transform: [{ scale: 0.8 }] }}
                              />
                              <Text className="text-[11px] font-extrabold text-slate-800">Primary (Default)</Text>
                            </View>

                            <View className="flex-row items-center gap-2">
                              <Switch
                                value={formState.is_active}
                                onValueChange={(val) => setFormState(prev => ({ ...prev, is_active: val }))}
                                trackColor={{ false: '#cbd5e1', true: '#0F172A' }}
                                thumbColor={formState.is_active ? '#ffffff' : '#f4f3f4'}
                                style={{ transform: [{ scale: 0.8 }] }}
                              />
                              <Text className="text-[11px] font-extrabold text-slate-800">Active Printer</Text>
                            </View>
                          </View>
                        </View>

                        {/* Actions */}
                        <View className="flex-row gap-2.5 border-t border-slate-200/80 pt-4.5 mt-4 justify-end flex-wrap">
                          <Pressable
                            className="px-4.5 rounded-xl border border-slate-200 bg-white active:bg-slate-50 items-center justify-center flex-row gap-1.5"
                            style={({ pressed }) => [pressed && { opacity: 0.9 }, { height: 36 }]}
                            onPress={handleTestConnection}
                            disabled={testing || submitting}
                          >
                            {testing ? (
                              <ActivityIndicator size="small" color="#0F172A" style={{ transform: [{ scale: 0.7 }] }} />
                            ) : (
                              <Text className="font-extrabold text-slate-700 text-[11px]">Test Connection</Text>
                            )}
                          </Pressable>

                          <Pressable
                            className="px-5.5 rounded-xl bg-slate-900 active:opacity-95 items-center justify-center flex-row gap-1.5"
                            style={({ pressed }) => [pressed && { opacity: 0.9 }, { height: 36 }]}
                            onPress={handleSave}
                            disabled={testing || submitting}
                          >
                            {submitting ? (
                              <ActivityIndicator size="small" color="white" style={{ transform: [{ scale: 0.7 }] }} />
                            ) : (
                              <Text className="font-extrabold text-white text-[11px]">Save Printer</Text>
                            )}
                          </Pressable>
                        </View>
                      </View>
                    </View>
                  ) : (
                    <Pressable
                      onPress={handleStartNew}
                      className="bg-white border border-dashed border-slate-300 py-3 rounded-2xl flex-row items-center justify-center gap-1.5 active:bg-slate-50 shadow-xs"
                    >
                      <Plus size={14} color="#0F172A" />
                      <Text className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">+ Add Another Printer</Text>
                    </Pressable>
                  )}
                </>
              )}
            </View>
          </ScrollView>
        ) : activeTab === 'system' ? (
          <ScrollView className="flex-1 animate-fade-in" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 130 }}>
            <View className="mb-6">
              <Text style={{ fontSize: 20, fontWeight: '600', color: '#0F172A' }}>
                System Profile
              </Text>
              <Text className="text-sm text-slate-500 mt-1">General configurations and core POS metadata</Text>
            </View>

            <View className="flex-row flex-wrap -mx-3 gap-y-6">
              {/* POS Brand Card */}
              <View className="w-full md:w-1/2 px-3">
                <View className="bg-white border border-slate-200/80 p-6 rounded-[18px] shadow-xs flex-col justify-between" style={{ minHeight: 140 }}>
                  <View>
                    <Text className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2.5">POS Brand</Text>
                    <Text className="text-[22px] font-semibold text-slate-800">{brand.name}</Text>
                  </View>
                  <Text className="text-xs text-slate-500 mt-3">{brand.tagline}</Text>
                </View>
              </View>

              {/* Active Currency Card */}
              <View className="w-full md:w-1/2 px-3">
                <View className="bg-white border border-slate-200/80 p-6 rounded-[18px] shadow-xs flex-col justify-between" style={{ minHeight: 140 }}>
                  <View>
                    <Text className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2.5">Active Currency</Text>
                    <Text className="text-[22px] font-semibold text-slate-800">INR (₹)</Text>
                  </View>
                  <Text className="text-xs text-slate-500 mt-3">Primary transaction and billing currency.</Text>
                </View>
              </View>

              {/* Print Protocol Card */}
              <View className="w-full md:w-1/2 px-3">
                <View className="bg-white border border-slate-200/80 p-6 rounded-[18px] shadow-xs flex-col justify-between" style={{ minHeight: 140 }}>
                  <View>
                    <Text className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2.5">Print Protocol</Text>
                    <Text className="text-[22px] font-semibold text-slate-800">ESC/POS (Network IP)</Text>
                  </View>
                  <Text className="text-xs text-slate-500 mt-3">Thermal printer stream and spool formatting protocol.</Text>
                </View>
              </View>

              {/* Local Print Bridge Card */}
              <View className="w-full md:w-1/2 px-3">
                <View className="bg-white border border-slate-200/80 p-6 rounded-[18px] shadow-xs flex-col justify-between" style={{ minHeight: 140 }}>
                  <View>
                    <Text className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2.5">Local Print Bridge</Text>
                    <Pressable className="self-start active:opacity-80">
                      <Text className="text-[22px] font-semibold text-sky-600 underline">localhost:4545</Text>
                    </Pressable>
                  </View>
                  <Text className="text-xs text-slate-500 mt-3">Operational production endpoint of the local print agent.</Text>
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
