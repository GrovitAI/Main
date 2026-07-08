import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, TextInput, ActivityIndicator, Platform, ScrollView, Alert } from 'react-native';
import { Printer as PrinterIcon, AlertCircle, Settings, Wifi, BookOpen, RefreshCw, Cpu, CheckCircle2, Play, Heart } from 'lucide-react-native';
import { colors, brand } from '@/lib/pos/brand';
import { fetchPrinters, savePrinter, deletePrinter, syncPrintNodePrinters, type Printer } from '@/lib/pos/printer-db-service';
import { printerService, fetchPrintNodePrinters, type PrintNodePrinter } from '@/lib/printer/printer-service';
import { MenuManagement } from '@/components/settings/MenuManagement';
import { LinearGradient } from 'expo-linear-gradient';
import { Trash2 } from 'lucide-react-native';

export default function SettingsScreen() {
  const [activeTab, setActiveTab] = useState<'system' | 'printers' | 'menu'>('printers');
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [testing, setTesting] = useState(false);
  
  const [formError, setFormError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [receiptFooter, setReceiptFooter] = useState('');

  const [printNodePrinters, setPrintNodePrinters] = useState<PrintNodePrinter[]>([]);
  const [loadingPrintNode, setLoadingPrintNode] = useState(false);
  const [testingPrinterId, setTestingPrinterId] = useState<string | number | null>(null);

  const loadPrinters = async (shouldSync = false) => {
    setLoading(true);
    setLoadingPrintNode(true);
    setFormError(null);

    let pnPrinters: PrintNodePrinter[] = [];
    try {
      // 1. Fetch live PrintNode printers
      pnPrinters = await fetchPrintNodePrinters();
      setPrintNodePrinters(pnPrinters);

      // 2. Synchronize with database
      if (shouldSync && pnPrinters.length > 0) {
        try {
          const result = await syncPrintNodePrinters(pnPrinters);
          if (result.error) {
            console.error(result.error);
            Alert.alert(
              "Printer Sync Failed",
              result.error ?? "Unknown database error"
            );
          }
        } catch (err) {
          console.error(err);
          Alert.alert(
            "Printer Sync Failed",
            err instanceof Error ? err.message : "Unknown error"
          );
        }
      }
    } catch (err: any) {
      setFormError(err.message || 'Failed to fetch PrintNode printers.');
    }

    // 3. Load configurations from database
    const res = await fetchPrinters();
    if (res.data) {
      setPrinters(res.data);
    }

    setLoading(false);
    setLoadingPrintNode(false);
  };

  useEffect(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      const storedFooter = window.localStorage.getItem('receiptFooter') || '* Thank you for your visit! *';
      setReceiptFooter(storedFooter);
    }
    loadPrinters(true);
  }, []);

  const handleToggleActive = async (printer: Printer) => {
    setSubmitting(true);
    setSuccessMsg(null);
    setFormError(null);
    try {
      const res = await savePrinter({
        ...printer,
        is_active: !printer.is_active,
      });
      if (res.error) {
        setFormError(res.error);
      } else {
        setSuccessMsg(`Printer "${printer.name}" ${!printer.is_active ? 'enabled' : 'disabled'} successfully!`);
        await loadPrinters(false);
      }
    } catch (err: any) {
      setFormError(err.message || 'Failed to save printer.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleDefault = async (printer: Printer) => {
    setSubmitting(true);
    setSuccessMsg(null);
    setFormError(null);
    try {
      const res = await savePrinter({
        ...printer,
        is_default: !printer.is_default,
      });
      if (res.error) {
        setFormError(res.error);
      } else {
        setSuccessMsg(`Printer "${printer.name}" default status updated.`);
        await loadPrinters(false);
      }
    } catch (err: any) {
      setFormError(err.message || 'Failed to save printer.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleChangeRole = async (printer: Printer, newRole: 'bill' | 'kitchen') => {
    setSubmitting(true);
    setSuccessMsg(null);
    setFormError(null);
    try {
      const res = await savePrinter({
        ...printer,
        printer_role: newRole,
        is_default: newRole === 'bill' ? printer.is_default : false,
      });
      if (res.error) {
        setFormError(res.error);
      } else {
        setSuccessMsg(`Printer "${printer.name}" role set to ${newRole === 'bill' ? 'Billing' : 'Kitchen'}.`);
        await loadPrinters(false);
      }
    } catch (err: any) {
      setFormError(err.message || 'Failed to save printer.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeletePrinter = async (id: string) => {
    setSubmitting(true);
    setSuccessMsg(null);
    setFormError(null);
    try {
      const res = await deletePrinter(id);
      if (res.error) {
        setFormError(res.error);
      } else {
        setSuccessMsg('Printer configuration removed.');
        await loadPrinters(false);
      }
    } catch (err: any) {
      setFormError(err.message || 'Failed to delete printer.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleTestPrint = async (printer: Printer) => {
    setTestingPrinterId(printer.ip_address);
    setSuccessMsg(null);
    setFormError(null);
    try {
      await printerService.testPrinter(printer);
      setSuccessMsg(`Test print sent to "${printer.name}" successfully!`);
    } catch (err: any) {
      setFormError(err.message || 'Failed to send test print.');
    } finally {
      setTestingPrinterId(null);
    }
  };

  return (
    <View style={{
      flex: 1,
      backgroundColor: '#F8FAFC',
      paddingTop: activeTab === 'menu' ? (Platform.OS === 'ios' ? 36 : (Platform.OS === 'android' ? 16 : 0)) : 0
    }}>
      {/* Modern Premium Page Header */}
      {activeTab !== 'menu' && (
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
      )}

      {/* Main Container with generous SaaS padding */}
      <View className={`flex-1 ${activeTab === 'menu' ? 'px-0 mb-0' : 'px-8'}`}>
        
        {/* Segmented SaaS Navigation Tab Bar */}
        {activeTab !== 'menu' && (
          <View className="flex-row bg-slate-100/90 p-1 rounded-2xl shadow-xs border border-slate-200/60 self-start mb-8">
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
        )}

        {activeTab === 'printers' ? (
          <ScrollView className="flex-1" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 130 }}>
            
            {/* Receipt Footer Message Card */}
            <View className="bg-white border border-slate-200/80 p-5 rounded-2xl mb-6 shadow-xs gap-3">
              <View className="flex-row items-center gap-3">
                <View className="p-2 bg-slate-50 border border-slate-100 rounded-lg w-9 h-9 items-center justify-center">
                  <Heart size={16} color="#0F172A" />
                </View>
                <View>
                  <Text className="text-sm font-bold text-[#0F172A]">Receipt Footer Message</Text>
                  <Text className="text-[10px] text-slate-500 mt-0.5">Customize the thank you note displayed at the bottom of customer bills.</Text>
                </View>
              </View>
              <TextInput
                value={receiptFooter}
                onChangeText={(text) => {
                  setReceiptFooter(text);
                  if (typeof window !== 'undefined' && window.localStorage) {
                    window.localStorage.setItem('receiptFooter', text);
                  }
                }}
                placeholder="e.g., * Thank you for your visit! *"
                className="bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-700 font-semibold"
                style={{ minHeight: 40 }}
              />
            </View>

            {/* PrintNode Cloud Printers Header Card */}
            <View className="flex-row items-center justify-between mb-4 flex-wrap gap-2.5">
              <View>
                <Text style={{ fontSize: 18, fontWeight: '700', color: '#0F172A' }}>
                  PrintNode Cloud Printers
                </Text>
                <Text className="text-xs text-slate-500 mt-0.5">Select and test printers synchronized via PrintNode client.</Text>
              </View>
              <Pressable
                disabled={loading || loadingPrintNode}
                onPress={() => loadPrinters(true)}
                className="flex-row items-center gap-1.5 bg-slate-150 border border-slate-200 px-3.5 py-2 rounded-xl active:bg-slate-200"
              >
                <RefreshCw size={12} color="#0f172a" className={loadingPrintNode ? 'animate-spin' : ''} />
                <Text className="text-[#0F172A] text-xs font-bold">Refresh List</Text>
              </Pressable>
            </View>

            {/* Error notifications */}
            {formError && (
              <View className="flex-row items-center gap-2 bg-rose-50 p-4 border border-rose-200 rounded-2xl mb-5">
                <AlertCircle size={16} color="#dc2626" />
                <Text className="text-rose-700 font-bold flex-1 text-xs">{formError}</Text>
              </View>
            )}

            {/* Success notifications */}
            {successMsg && (
              <View className="flex-row items-center gap-2 bg-emerald-50 p-4 border border-emerald-200 rounded-2xl mb-5">
                <CheckCircle2 size={16} color="#15803d" />
                <Text className="text-emerald-700 font-bold flex-1 text-xs">{successMsg}</Text>
              </View>
            )}

            {/* DB Configured Printers list */}
            {loading ? (
              <View className="items-center justify-center py-20 bg-white rounded-2xl border border-slate-200/80 shadow-xs">
                <ActivityIndicator size="large" color="#0F172A" />
                <Text className="text-slate-500 font-bold mt-3.5 text-xs">Retrieving configured printers...</Text>
              </View>
            ) : printers.length === 0 ? (
              <View className="bg-amber-50 border border-amber-200 p-5 rounded-2xl flex-row items-center gap-3.5 shadow-xs">
                <AlertCircle size={20} color="#d97706" />
                <View className="flex-1">
                  <Text className="text-xs font-bold text-amber-800">No Configured Printers</Text>
                  <Text className="text-[11px] text-amber-700 mt-1 leading-relaxed">
                    No printers have been synchronized yet. Please click the "Refresh List" button to fetch available printers from your PrintNode account.
                  </Text>
                </View>
              </View>
            ) : (
              <View className="w-full gap-4">
                {printers.map((printer) => {
                  const liveMatch = printNodePrinters.find(p => String(p.id) === printer.ip_address);
                  const isOnline = liveMatch ? liveMatch.state === 'online' : false;
                  const computerName = liveMatch?.computer?.name ?? 'Unknown';

                  return (
                    <View 
                      key={printer.id} 
                      className={`bg-white rounded-2xl border p-5 mb-1.5 gap-4.5 transition-all ${
                        printer.is_active ? 'border-slate-800 shadow-sm' : 'border-slate-200/80 shadow-xs'
                      }`}
                    >
                      <View className="flex-row justify-between items-start flex-wrap gap-2.5">
                        <View className="flex-row items-center gap-3.5 flex-1 min-w-[200px]">
                          <View className={`p-2.5 rounded-xl items-center justify-center border ${
                            isOnline ? 'bg-emerald-50 border-emerald-100' : 'bg-slate-50 border-slate-100'
                          }`}>
                            <PrinterIcon size={18} color={isOnline ? '#10b981' : '#64748b'} />
                          </View>
                          <View className="flex-1">
                            <View className="flex-row items-center gap-2 flex-wrap">
                              <Text className="font-bold text-[#0F172A] text-sm">{printer.name}</Text>
                              
                              <View className={`px-2 py-0.5 rounded-full flex-row items-center gap-1 ${
                                isOnline ? 'bg-emerald-50 border-emerald-200/40' : 'bg-rose-50 border-rose-200/40'
                              }`}>
                                <View className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                                <Text className={`text-[9px] font-black uppercase ${isOnline ? 'text-emerald-700' : 'text-rose-700'}`}>
                                  {isOnline ? 'Online' : 'Offline'}
                                </Text>
                              </View>

                              <View className={`px-2 py-0.5 rounded-full border ${
                                printer.is_active ? 'bg-slate-100 border-slate-350' : 'bg-slate-50 border-slate-200'
                              }`}>
                                <Text className={`text-[9px] font-black uppercase ${printer.is_active ? 'text-slate-700' : 'text-slate-400'}`}>
                                  {printer.is_active ? 'Enabled' : 'Disabled'}
                                </Text>
                              </View>
                            </View>
                            <Text className="text-xs text-slate-500 mt-1 font-semibold">
                              ID: {printer.ip_address} • Computer: {computerName}
                            </Text>
                          </View>
                        </View>

                        {/* Active Badges */}
                        <View className="flex-row gap-1.5 flex-wrap">
                          {printer.is_active && printer.printer_role === 'bill' && (
                            <View className="bg-slate-900 border border-slate-900 px-3 py-1.5 rounded-xl flex-row items-center gap-1">
                              <CheckCircle2 size={11} color="#ffffff" />
                              <Text className="text-white text-[9px] font-black uppercase">Active Bill</Text>
                            </View>
                          )}
                          {printer.is_active && printer.printer_role === 'kitchen' && (
                            <View className="bg-slate-800 border border-slate-800 px-3 py-1.5 rounded-xl flex-row items-center gap-1">
                              <CheckCircle2 size={11} color="#ffffff" />
                              <Text className="text-white text-[9px] font-black uppercase">Active Kitchen</Text>
                            </View>
                          )}
                          {printer.is_active && printer.is_default && printer.printer_role === 'bill' && (
                            <View className="bg-sky-500 border border-sky-500 px-3 py-1.5 rounded-xl flex-row items-center gap-1">
                              <CheckCircle2 size={11} color="#ffffff" />
                              <Text className="text-white text-[9px] font-black uppercase">Default</Text>
                            </View>
                          )}
                        </View>
                      </View>

                      {/* Actions row */}
                      <View className="flex-row justify-between border-t border-slate-100 pt-4 flex-wrap gap-3.5 items-center">
                        <View className="flex-row gap-3 flex-wrap flex-1 min-w-[280px] items-center">
                          {/* Active toggle */}
                          <Pressable
                            disabled={submitting}
                            onPress={() => handleToggleActive(printer)}
                            className={`px-4 h-9 rounded-xl items-center justify-center flex-row border ${
                              printer.is_active 
                                ? 'bg-rose-50 border-rose-200 text-rose-700 active:bg-rose-100' 
                                : 'bg-emerald-50 border-emerald-200 text-emerald-700 active:bg-emerald-100'
                            }`}
                          >
                            <Text className={`font-extrabold text-[11px] ${printer.is_active ? 'text-rose-700' : 'text-emerald-700'}`}>
                              {printer.is_active ? 'Disable' : 'Enable'}
                            </Text>
                          </Pressable>

                          {/* Role segment selector */}
                          <View className="flex-row bg-slate-100 p-0.5 rounded-xl border border-slate-200/50">
                            <Pressable
                              disabled={submitting}
                              onPress={() => handleChangeRole(printer, 'bill')}
                              className={`px-3 py-1.5 rounded-lg ${
                                printer.printer_role === 'bill' ? 'bg-white shadow-xs' : 'bg-transparent'
                              }`}
                            >
                              <Text className={`text-[10px] font-extrabold ${printer.printer_role === 'bill' ? 'text-slate-800' : 'text-slate-500'}`}>
                                Billing Receipt
                              </Text>
                            </Pressable>
                            <Pressable
                              disabled={submitting}
                              onPress={() => handleChangeRole(printer, 'kitchen')}
                              className={`px-3 py-1.5 rounded-lg ${
                                printer.printer_role === 'kitchen' ? 'bg-white shadow-xs' : 'bg-transparent'
                              }`}
                            >
                              <Text className={`text-[10px] font-extrabold ${printer.printer_role === 'kitchen' ? 'text-slate-800' : 'text-slate-500'}`}>
                                Kitchen KOT
                              </Text>
                            </Pressable>
                          </View>

                          {/* Default check (Only relevant for Billing role and when active) */}
                          {printer.printer_role === 'bill' && printer.is_active && (
                            <Pressable
                              disabled={submitting}
                              onPress={() => handleToggleDefault(printer)}
                              className="flex-row items-center gap-2 px-2 py-1 active:opacity-75"
                            >
                              <View className={`w-4 h-4 rounded-md border items-center justify-center ${
                                printer.is_default ? 'bg-slate-900 border-slate-900' : 'bg-white border-slate-350'
                              }`}>
                                {printer.is_default && <CheckCircle2 size={10} color="#ffffff" />}
                              </View>
                              <Text className="text-[11px] font-extrabold text-slate-700">Set as Default Billing</Text>
                            </Pressable>
                          )}
                        </View>

                        {/* Test print & Delete */}
                        <View className="flex-row gap-2 items-center">
                          <Pressable
                            disabled={testingPrinterId !== null || !isOnline}
                            onPress={() => handleTestPrint(printer)}
                            className={`px-4 h-9 rounded-xl border border-slate-200 bg-white active:bg-slate-50 items-center justify-center flex-row gap-1.5 ${!isOnline ? 'opacity-40' : ''}`}
                          >
                            {testingPrinterId === printer.ip_address ? (
                              <ActivityIndicator size="small" color="#0F172A" style={{ transform: [{ scale: 0.7 }] }} />
                            ) : (
                              <>
                                <Play size={10} color="#64748b" fill="#64748b" />
                                <Text className="font-extrabold text-slate-700 text-[11px]">Test Print</Text>
                              </>
                            )}
                          </Pressable>

                          <Pressable
                            disabled={submitting}
                            onPress={() => handleDeletePrinter(printer.id)}
                            className="p-2 h-9 w-9 rounded-xl border border-rose-200 bg-rose-50 active:bg-rose-100 items-center justify-center"
                          >
                            <Trash2 size={12} color="#e11d48" />
                          </Pressable>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
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
          <MenuManagement onBack={() => setActiveTab('system')} />
        )}
      </View>
    </View>
  );
}
