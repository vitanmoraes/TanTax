
import React, { useState, useMemo } from 'react';
import { extractBillingData, extractPayrollData } from './services/geminiService';
import { BillingRecord, PayrollRecord, MonthlyStats } from './types';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, ComposedChart, Area, AreaChart, Cell, LabelList
} from 'recharts';
import {
  FileText,
  Upload,
  CheckCircle2,
  AlertCircle,
  DollarSign,
  Users,
  Calculator,
  LayoutDashboard,
  ArrowRight,
  FileCode,
  Search,
  Building2,
  ShieldCheck,
  TrendingDown,
  Scale,
  Zap,
  Clock,
  Briefcase
} from 'lucide-react';
import { fetchCNPJData, BrasilAPI_CNPJ } from './services/brasilApiService';
import { calculateTaxEngine, TaxResults } from './services/taxEngine';
import { mapCnaeToActivity, AppActivity } from './services/cnaeMapper';
import { useAuth } from './AuthContext';
import { Login } from './Login';
import { LogOut } from 'lucide-react';

interface SelectedFile {
  base64: string;
  mimeType: string;
  name: string;
}

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

const App: React.FC = () => {
  const { user, loading, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState<'analysis' | 'brasilapi' | 'tax-rules' | 'calculation-memory' | 'report'>('analysis');
  const [billingFile, setBillingFile] = useState<SelectedFile | null>(null);
  const [payrollFile, setPayrollFile] = useState<SelectedFile | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // BrasilAPI State
  const [cnpjQuery, setCnpjQuery] = useState('');
  const [brasilApiData, setBrasilApiData] = useState<BrasilAPI_CNPJ | null>(null);
  const [isSearchingCnpj, setIsSearchingCnpj] = useState(false);

  const [companyInfo, setCompanyInfo] = useState({ name: '', cnpj: '' });
  const [billingRecords, setBillingRecords] = useState<BillingRecord[]>([]);
  const [payrollRecords, setPayrollRecords] = useState<PayrollRecord[]>([]);

  // Simulation State for Tax Rules
  const [simRbt12, setSimRbt12] = useState<number>(0);
  const [simMonthlyBilling, setSimMonthlyBilling] = useState<number>(0);
  const [simMonthlyPayroll, setSimMonthlyPayroll] = useState<number>(0);
  const [simActivity, setSimActivity] = useState<'comercio' | 'industria' | 'servico_geral' | 'servico_intellectual' | 'hospitalar'>('servico_intellectual');
  const [simIsB2B, setSimIsB2B] = useState<boolean>(true);
  const [simIssRate, setSimIssRate] = useState<number>(0.05);
  const [simActivities, setSimActivities] = useState<{ activity: AppActivity; percentage: number; label: string; cnae?: string }[]>([]);

  const formatRawToCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value || 0);
  };

  const parseCurrencyToNumber = (value: string) => {
    return Number(value.replace(/\D/g, "")) / 100;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'billing' | 'payroll') => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        const [meta, data] = result.split(',');
        const mimeType = meta.split(':')[1].split(';')[0];

        const fileData: SelectedFile = {
          base64: data,
          mimeType: mimeType,
          name: file.name
        };

        if (type === 'billing') setBillingFile(fileData);
        else setPayrollFile(fileData);
      };
      reader.readAsDataURL(file);
    }
  };

  const processDocuments = async () => {
    if (!billingFile || !payrollFile) {
      setError("Por favor, selecione ambos os arquivos PDF (Faturamento e Folha).");
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const [billingRes, payrollRes] = await Promise.all([
        extractBillingData(billingFile),
        extractPayrollData(payrollFile)
      ]);

      setCompanyInfo({ name: billingRes.companyName, cnpj: billingRes.cnpj });
      setBillingRecords(billingRes.records);
      setPayrollRecords(payrollRes.records);
    } catch (err) {
      console.error(err);
      setError("Erro ao processar documentos. Certifique-se de que os PDFs estão legíveis.");
    } finally {
      setIsProcessing(false);
    }
  };

  const executeCnpjSearch = async (cnpjToSearch: string) => {
    setIsSearchingCnpj(true);
    setBrasilApiData(null);
    setError(null);
    try {
      const data = await fetchCNPJData(cnpjToSearch);
      setBrasilApiData(data);
    } catch (err: any) {
      setError(err.message || "Erro ao consultar CNPJ.");
    } finally {
      setIsSearchingCnpj(false);
    }
  };

  const handleCnpjSearch = () => {
    if (!cnpjQuery) return;
    executeCnpjSearch(cnpjQuery);
  };

  // Automate CNPJ Search when extracted from PDF
  React.useEffect(() => {
    if (companyInfo.cnpj) {
      const sanitized = companyInfo.cnpj.replace(/\D/g, '');
      if (sanitized && sanitized.length === 14) {
        if (sanitized !== brasilApiData?.cnpj?.replace(/\D/g, '')) {
          setCnpjQuery(sanitized);
          executeCnpjSearch(sanitized);
        }
      }
    }
  }, [companyInfo.cnpj]);

  // Map CNAEs to activities when data is fetched
  React.useEffect(() => {
    if (brasilApiData) {
      const activities: { activity: AppActivity; percentage: number; label: string; cnae: string }[] = [];

      // Primary CNAE
      if (brasilApiData.cnae_fiscal) {
        activities.push({
          cnae: brasilApiData.cnae_fiscal.toString(),
          label: brasilApiData.cnae_fiscal_descricao || 'Atividade Principal',
          activity: mapCnaeToActivity(brasilApiData.cnae_fiscal.toString()),
          percentage: 100
        });
      }

      // Secondary CNAEs
      if (brasilApiData.cnaes_secundarios) {
        brasilApiData.cnaes_secundarios.forEach(c => {
          activities.push({
            cnae: c.codigo.toString(),
            label: c.descricao,
            activity: mapCnaeToActivity(c.codigo.toString()),
            percentage: 0
          });
        });
      }

      if (activities.length > 0) {
        setSimActivities(activities);
      }
    }
  }, [brasilApiData]);

  const normalizeMonthName = (monthStr: string): string => {
    const m = monthStr.toLowerCase();
    if (m.includes('jan')) return 'Janeiro';
    if (m.includes('fev')) return 'Fevereiro';
    if (m.includes('mar')) return 'Março';
    if (m.includes('abr')) return 'Abril';
    if (m.includes('mai')) return 'Maio';
    if (m.includes('jun')) return 'Junho';
    if (m.includes('jul')) return 'Julho';
    if (m.includes('ago')) return 'Agosto';
    if (m.includes('set')) return 'Setembro';
    if (m.includes('out')) return 'Outubro';
    if (m.includes('nov')) return 'Novembro';
    if (m.includes('dez')) return 'Dezembro';
    return monthStr;
  };

  const monthlyStats = useMemo((): MonthlyStats[] => {
    const stats: Record<string, { billing: number; payroll: number; monthName: string; year: number }> = {};

    billingRecords.forEach(r => {
      const monthName = normalizeMonthName(r.month);
      const key = `${monthName}/${r.year}`;
      if (!stats[key]) stats[key] = { billing: 0, payroll: 0, monthName, year: r.year };
      stats[key].billing += r.total;
    });

    payrollRecords.forEach(r => {
      const parts = r.competence.split('/');
      if (parts.length === 2) {
        const mIdx = parseInt(parts[0], 10) - 1;
        const year = parseInt(parts[1], 10);
        const monthName = MONTH_NAMES[mIdx] || parts[0];
        const key = `${monthName}/${year}`;
        if (!stats[key]) stats[key] = { billing: 0, payroll: 0, monthName, year };
        stats[key].payroll += r.value;
      }
    });

    return Object.values(stats)
      .map(data => ({
        month: `${data.monthName}/${data.year}`,
        billing: data.billing,
        payroll: data.payroll,
        fgts: data.payroll * 0.08,
        factorR: data.billing > 0 ? ((data.payroll * 1.08) / data.billing) * 100 : 0,
        sortKey: data.year * 100 + (MONTH_NAMES.indexOf(data.monthName) + 1)
      }))
      .sort((a, b) => a.sortKey - b.sortKey);
  }, [billingRecords, payrollRecords]);

  const totalBilling = billingRecords.reduce((acc, curr) => acc + curr.total, 0);
  const totalPayroll = payrollRecords.reduce((acc, curr) => acc + curr.value, 0) * 1.08;

  const accumulatedFactorR = totalBilling > 0 ? (totalPayroll / totalBilling) * 100 : 0;

  // Statistical Metrics for Simulation
  const statsMetrics = useMemo(() => {
    const billings = monthlyStats.map(s => s.billing).filter(v => v > 0);
    const payrolls = monthlyStats.map(s => s.payroll).filter(v => v > 0);

    const calcMedian = (arr: number[]) => {
      if (arr.length === 0) return 0;
      const sorted = [...arr].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    };

    return {
      billing: {
        avg: billings.length > 0 ? billings.reduce((a, b) => a + b, 0) / billings.length : 0,
        latest: billings.length > 0 ? billings[billings.length - 1] : 0,
        median: calcMedian(billings)
      },
      payroll: {
        avg: payrolls.length > 0 ? payrolls.reduce((a, b) => a + b, 0) / payrolls.length : 0,
        latest: payrolls.length > 0 ? payrolls[payrolls.length - 1] : 0,
        median: calcMedian(payrolls)
      }
    };
  }, [monthlyStats]);

  const taxSimulation = useMemo(() => {
    const rbt12 = simRbt12 || totalBilling;
    const mBilling = simMonthlyBilling || (totalBilling / 12) || 0;
    const mPayroll = simMonthlyPayroll || (totalPayroll / 12) || 0;

    // Use simActivities if defined, otherwise fallback to simActivity
    const activeActivities = simActivities.length > 0
      ? simActivities.filter(a => a.percentage > 0)
      : [{ activity: simActivity, percentage: 100, label: 'Geral' }];

    if (activeActivities.length === 0) {
      return calculateTaxEngine(rbt12, mBilling, mPayroll, simActivity, simIsB2B);
    }

    const results = activeActivities.map(a => {
      const weight = a.percentage / 100;
      return {
        weight,
        res: calculateTaxEngine(rbt12, mBilling * weight, mPayroll * weight, a.activity, simIsB2B, simIssRate)
      };
    });

    // Aggregate results
    const firstRes = results[0].res;
    const aggregated: TaxResults = {
      simples: { ...firstRes.simples, dasTotal: 0 },
      lucroPresumido: { ...firstRes.lucroPresumido, total: 0, irpj: 0, csll: 0, pis: 0, cofins: 0 },
      reforma2026: { ...firstRes.reforma2026, cbs_ibs: 0 },
      sugestao: firstRes.sugestao
    };

    results.forEach(({ weight, res }) => {
      aggregated.simples.dasTotal += res.simples.dasTotal;
      aggregated.lucroPresumido.irpj += res.lucroPresumido.irpj;
      aggregated.lucroPresumido.csll += res.lucroPresumido.csll;
      aggregated.lucroPresumido.pis += res.lucroPresumido.pis;
      aggregated.lucroPresumido.cofins += res.lucroPresumido.cofins;
      aggregated.lucroPresumido.issqn += res.lucroPresumido.issqn;
      aggregated.lucroPresumido.total += res.lucroPresumido.total;
      aggregated.reforma2026.cbs_ibs += res.reforma2026.cbs_ibs;
    });

    aggregated.simples.aliquotaEfetiva = mBilling > 0 ? (aggregated.simples.dasTotal / mBilling) * 100 : 0;
    aggregated.lucroPresumido.aliquotaEfetiva = mBilling > 0 ? (aggregated.lucroPresumido.total / mBilling) * 100 : 0;

    // Choose suggestion based on totals
    aggregated.sugestao = aggregated.lucroPresumido.total < aggregated.simples.dasTotal
      ? (simIsB2B ? "Lucro Presumido (Considere Regime Híbrido)" : "Lucro Presumido")
      : "Simples Nacional";

    return aggregated;
  }, [simRbt12, simMonthlyBilling, simMonthlyPayroll, simActivity, simIsB2B, totalBilling, totalPayroll, simActivities]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-20">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-indigo-600 p-2 rounded-lg shadow-indigo-200 shadow-lg">
              <Calculator className="text-white w-6 h-6" />
            </div>
            <h1 className="text-xl font-black tracking-tight bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
              TanTax
            </h1>
          </div>
          <div className="flex items-center gap-4">
            <nav className="hidden md:flex bg-slate-100 p-1 rounded-xl">
              <button
                onClick={() => setActiveTab('analysis')}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'analysis' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Análise de PDFs
              </button>
              <button
                onClick={() => setActiveTab('brasilapi')}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'brasilapi' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Consulta
              </button>
              <button
                onClick={() => setActiveTab('tax-rules')}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'tax-rules' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Planejador 2026
              </button>
              <button
                onClick={() => setActiveTab('calculation-memory')}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'calculation-memory' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Memória de Cálculo
              </button>
              <button
                onClick={() => setActiveTab('report')}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'report' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Relatório
              </button>
            </nav>
            <div className="h-8 w-[1px] bg-slate-200 hidden md:block"></div>
            <button
              onClick={() => signOut()}
              className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
              title="Sair"
            >
              <LogOut size={20} />
            </button>
            <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold border border-indigo-200">
              {user.email?.[0].toUpperCase()}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {activeTab === 'analysis' ? (
          <>
            <div className="mb-10 text-center max-w-2xl mx-auto">
              <h2 className="text-3xl font-extrabold text-slate-800 mb-3 tracking-tight">Extração de PDFs Contábeis</h2>
              <p className="text-slate-500 text-lg">Envie seus arquivos PDF de faturamento e folha para análise automática de Fator R.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
              <div className={`bg-white p-8 rounded-3xl shadow-xl border-2 transition-all ${billingFile ? 'border-indigo-500 ring-4 ring-indigo-50' : 'border-slate-100 hover:border-indigo-200'}`}>
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl">
                      <FileText size={24} />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-800">PDF de Faturamento</h3>
                      <p className="text-xs text-slate-400">Extrato dos últimos 12 meses</p>
                    </div>
                  </div>
                  {billingFile && <CheckCircle2 className="text-green-500" size={24} />}
                </div>
                <label className="group relative flex flex-col items-center justify-center w-full h-44 border-2 border-dashed border-slate-200 rounded-2xl cursor-pointer bg-slate-50 hover:bg-white hover:border-indigo-400 transition-all">
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <Upload className="w-10 h-10 mb-4 text-slate-300 group-hover:text-indigo-500 group-hover:scale-110 transition-all" />
                    <p className="text-sm text-slate-500 mb-1">
                      <span className="font-bold text-indigo-600">{billingFile ? 'Alterar Arquivo' : 'Selecionar PDF'}</span>
                    </p>
                    <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">{billingFile ? billingFile.name : 'Clique ou arraste'}</p>
                  </div>
                  <input type="file" className="hidden" accept="application/pdf,image/*" onChange={(e) => handleFileChange(e, 'billing')} />
                </label>
              </div>

              <div className={`bg-white p-8 rounded-3xl shadow-xl border-2 transition-all ${payrollFile ? 'border-violet-500 ring-4 ring-violet-50' : 'border-slate-100 hover:border-violet-200'}`}>
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-violet-50 text-violet-600 rounded-2xl">
                      <Users size={24} />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-800">PDF de Folha</h3>
                      <p className="text-xs text-slate-400">Relatório de pagamentos/eSocial</p>
                    </div>
                  </div>
                  {payrollFile && <CheckCircle2 className="text-green-500" size={24} />}
                </div>
                <label className="group relative flex flex-col items-center justify-center w-full h-44 border-2 border-dashed border-slate-200 rounded-2xl cursor-pointer bg-slate-50 hover:bg-white hover:border-violet-400 transition-all">
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <Upload className="w-10 h-10 mb-4 text-slate-300 group-hover:text-violet-500 group-hover:scale-110 transition-all" />
                    <p className="text-sm text-slate-500 mb-1">
                      <span className="font-bold text-violet-600">{payrollFile ? 'Alterar Arquivo' : 'Selecionar PDF'}</span>
                    </p>
                    <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">{payrollFile ? payrollFile.name : 'Clique ou arraste'}</p>
                  </div>
                  <input type="file" className="hidden" accept="application/pdf,image/*" onChange={(e) => handleFileChange(e, 'payroll')} />
                </label>
              </div>
            </div>

            <div className="flex flex-col items-center mb-16">
              {error && activeTab === 'analysis' && (
                <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-600 rounded-2xl flex items-center gap-3 max-w-md animate-bounce">
                  <AlertCircle size={20} />
                  <p className="text-sm font-medium">{error}</p>
                </div>
              )}
              <button
                onClick={processDocuments}
                disabled={isProcessing || !billingFile || !payrollFile}
                className={`
                  relative overflow-hidden px-10 py-4 rounded-2xl font-black text-white flex items-center gap-4 shadow-2xl transition-all
                  ${isProcessing || !billingFile || !payrollFile
                    ? 'bg-slate-300 cursor-not-allowed'
                    : 'bg-indigo-600 hover:bg-indigo-700 hover:-translate-y-1 active:translate-y-0'}
                `}
              >
                {isProcessing ? (
                  <>
                    <div className="w-5 h-5 border-4 border-white/30 border-t-white rounded-full animate-spin"></div>
                    Lendo PDFs com IA...
                  </>
                ) : (
                  <>
                    PROCESSAR DOCUMENTOS <ArrowRight size={22} />
                  </>
                )}
              </button>
            </div>

            {billingRecords.length > 0 && (
              <div className="space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-1000 fill-mode-both">
                <div className="bg-slate-900 text-white p-8 rounded-[2rem] shadow-2xl relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full -mr-20 -mt-20 blur-3xl group-hover:bg-indigo-500/20 transition-all duration-700"></div>
                  <div className="relative z-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                        <span className="text-indigo-400 text-[10px] font-black uppercase tracking-[0.2em]">Empresa Validada via PDF</span>
                      </div>
                      <h2 className="text-4xl font-black mb-1">{companyInfo.name}</h2>
                      <p className="text-slate-400 font-mono text-sm tracking-widest">{companyInfo.cnpj}</p>
                    </div>
                    <div className="flex gap-4">
                      <div className="bg-slate-800/50 p-4 rounded-2xl border border-slate-700">
                        <p className="text-slate-500 text-[10px] font-bold uppercase mb-1">Janela de Análise</p>
                        <p className="font-bold text-lg">{monthlyStats[0]?.month} → {monthlyStats[monthlyStats.length - 1]?.month}</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                  <KpiCard
                    label="Faturamento Acumulado"
                    value={totalBilling.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    icon={<DollarSign className="text-indigo-600" />}
                    subtext="Total dos 12 meses"
                    color="bg-indigo-50"
                  />
                  <KpiCard
                    label="Folha Acumulada"
                    value={totalPayroll.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    icon={<Users className="text-violet-600" />}
                    subtext="Total dos 12 meses"
                    color="bg-violet-50"
                  />
                  <KpiCard
                    label="Fator R (Acumulado)"
                    value={`${accumulatedFactorR.toFixed(2)}%`}
                    icon={<Calculator className="text-orange-600" />}
                    subtext={accumulatedFactorR >= 28 ? "Simples Anexo III ✅" : "Simples Anexo V ⚠️"}
                    color={accumulatedFactorR >= 28 ? "bg-emerald-50" : "bg-rose-50"}
                    highlight={accumulatedFactorR < 28}
                  />
                  <KpiCard
                    label="Status Tributário"
                    value={accumulatedFactorR >= 28 ? "Anexo III" : "Anexo V"}
                    icon={<FileCode className="text-slate-600" />}
                    subtext={accumulatedFactorR >= 28 ? "Tributação Reduzida" : "Tributação Padrão"}
                    color="bg-slate-100"
                  />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-200/50">
                    <h3 className="text-xl font-black mb-8 text-slate-800 flex items-center gap-2">
                      <div className="w-1.5 h-6 bg-indigo-600 rounded-full"></div>
                      Faturamento vs Folha
                    </h3>
                    <div className="h-[350px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={monthlyStats} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis dataKey="month" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} dy={10} />
                          <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `R$${v / 1000}k`} />
                          <Tooltip
                            cursor={{ fill: '#f8fafc' }}
                            contentStyle={{ borderRadius: '20px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', padding: '16px' }}
                            formatter={(value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          />
                          <Legend verticalAlign="top" align="right" height={40} iconType="circle" wrapperStyle={{ fontSize: '12px', fontWeight: 'bold', color: '#64748b' }} />
                          <Area type="monotone" dataKey="billing" name="Faturamento" fill="#818cf8" stroke="#4f46e5" strokeWidth={3} fillOpacity={0.1} />
                          <Bar dataKey={(s) => s.payroll + s.fgts} name="Folha + FGTS" fill="#ec4899" radius={[6, 6, 0, 0]} barSize={24} />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-200/50">
                    <h3 className="text-xl font-black mb-8 text-slate-800 flex items-center gap-2">
                      <div className="w-1.5 h-6 bg-orange-500 rounded-full"></div>
                      Curva do Fator R Mensal
                    </h3>
                    <div className="h-[350px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={monthlyStats} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis dataKey="month" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} dy={10} />
                          <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
                          <Tooltip
                            contentStyle={{ borderRadius: '20px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', padding: '16px' }}
                            formatter={(value: number) => [`${value.toFixed(2)}%`, "Fator R"]}
                          />
                          <Line
                            type="stepAfter"
                            dataKey="factorR"
                            stroke="#f59e0b"
                            strokeWidth={4}
                            dot={{ r: 6, fill: '#f59e0b', strokeWidth: 3, stroke: '#fff' }}
                            activeDot={{ r: 8, strokeWidth: 0 }}
                          />
                          <Line type="monotone" dataKey={() => 28} stroke="#ef4444" strokeDasharray="8 8" name="Mínimo 28%" dot={false} strokeWidth={2} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-[2rem] border border-slate-100 shadow-2xl overflow-hidden">
                  <div className="p-8 border-b border-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <h3 className="text-2xl font-black text-slate-800">Detalhamento Consolidado</h3>
                      <p className="text-sm text-slate-400 font-medium">Cruzamento de dados PDF Faturamento + Folha</p>
                    </div>
                    <button className="bg-indigo-50 text-indigo-700 px-6 py-2.5 rounded-xl text-sm font-black hover:bg-indigo-100 transition-colors flex items-center gap-2 border border-indigo-100">
                      EXPORTAR ANALÍTICO <Upload size={16} className="rotate-180" />
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="bg-slate-50/50 text-slate-400 text-[10px] uppercase tracking-[0.2em] font-black">
                          <th className="px-8 py-5">Período</th>
                          <th className="px-8 py-5">Faturamento (A)</th>
                          <th className="px-8 py-5">Folha Pagto (B)</th>
                          <th className="px-8 py-5">FGTS (8%)</th>
                          <th className="px-8 py-5">Fator R ((B+FGTS)/A)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {monthlyStats.map((stat, idx) => (
                          <tr key={idx} className="group hover:bg-indigo-50/30 transition-all duration-300">
                            <td className="px-8 py-6 font-bold text-slate-700">{stat.month}</td>
                            <td className="px-8 py-6 text-slate-500 font-medium">
                              {stat.billing.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            </td>
                            <td className="px-8 py-6 text-slate-500 font-medium">
                              {stat.payroll.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            </td>
                            <td className="px-8 py-6 text-slate-500 font-medium">
                              {(stat.payroll * 0.08).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            </td>
                            <td className="px-8 py-6">
                              <span className={`text-sm font-black px-3 py-1 rounded-lg ${stat.factorR >= 28 ? 'text-emerald-600 bg-emerald-50' : 'text-rose-600 bg-rose-50'}`}>
                                {stat.factorR.toFixed(2)}%
                              </span>
                            </td>
                            <td className="px-8 py-6">
                              {stat.factorR >= 28 ? (
                                <div className="flex items-center gap-2">
                                  <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
                                  <span className="text-[11px] font-black text-emerald-700 uppercase tracking-tighter">ANEXO III (Econômico)</span>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <div className="w-2 h-2 bg-rose-500 rounded-full"></div>
                                  <span className="text-[11px] font-black text-rose-700 uppercase tracking-tighter">ANEXO V (Caro)</span>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </>
        ) : activeTab === 'brasilapi' ? (
          <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="text-center mb-10">
              <h2 className="text-3xl font-extrabold text-slate-800 mb-3 tracking-tight">Consulta</h2>
              <p className="text-slate-500 text-lg">Consulte informações cadastrais completas via CNPJ.</p>
            </div>

            <div className="bg-white p-8 rounded-[2.5rem] shadow-2xl shadow-indigo-100/50 border border-slate-100">
              <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                  <input
                    type="text"
                    placeholder="Digite o CNPJ (apenas números)"
                    value={cnpjQuery}
                    onChange={(e) => setCnpjQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleCnpjSearch()}
                    className="w-full pl-12 pr-4 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50 transition-all outline-none font-medium text-slate-700"
                  />
                </div>
                <button
                  onClick={handleCnpjSearch}
                  disabled={isSearchingCnpj || !cnpjQuery}
                  className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white px-8 py-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg hover:-translate-y-1"
                >
                  {isSearchingCnpj ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <Search size={20} />}
                  BUSCAR CNPJ
                </button>
              </div>

              {error && activeTab === 'brasilapi' && (
                <div className="mt-6 p-4 bg-red-50 border border-red-200 text-red-600 rounded-2xl flex items-center gap-3 animate-in fade-in zoom-in-95">
                  <AlertCircle size={20} />
                  <p className="text-sm font-medium">{error}</p>
                </div>
              )}
            </div>

            {brasilApiData && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in slide-in-from-bottom-8 duration-700">
                <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-xl md:col-span-2">
                  <div className="flex items-center gap-4 mb-6">
                    <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl">
                      <Building2 size={32} />
                    </div>
                    <div>
                      <h3 className="text-2xl font-black text-slate-800 uppercase leading-tight">{brasilApiData.razao_social}</h3>
                      <p className="text-slate-400 font-mono tracking-widest">{brasilApiData.cnpj}</p>
                    </div>
                    <div className="ml-auto flex flex-col items-end">
                      <span className={`px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-wider ${brasilApiData.situacao_cadastral === 'ATIVA' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                        {brasilApiData.situacao_cadastral}
                      </span>
                      <p className="text-[10px] text-slate-400 font-bold mt-2 uppercase">Início: {brasilApiData.data_inicio_atividade}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-8 pt-6 border-t border-slate-50">
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Nome Fantasia</p>
                      <p className="font-bold text-slate-700">{brasilApiData.nome_fantasia || "Não informado"}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Natureza Jurídica</p>
                      <p className="font-bold text-slate-700">{brasilApiData.codigo_natureza_juridica} - {brasilApiData.natureza_juridica}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Capital Social</p>
                      <p className="font-bold text-slate-700">
                        {brasilApiData.capital_social?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) || "N/A"}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Optante pelo Simples</p>
                      <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase ${brasilApiData.opcao_pelo_simples ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'}`}>
                        {brasilApiData.opcao_pelo_simples === true ? 'SIM' : brasilApiData.opcao_pelo_simples === false ? 'NÃO' : 'NÃO INFORMADO'}
                      </span>
                    </div>
                  </div>

                  <div className="mt-8 p-6 bg-slate-50 rounded-2xl border border-slate-100">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Atividade Principal (CNAE)</p>
                    <div className="flex gap-4 items-start">
                      <span className="bg-indigo-600 text-white px-2 py-1 rounded-md text-[10px] font-mono font-bold shrink-0">{brasilApiData.cnae_fiscal}</span>
                      <p className="font-bold text-slate-800 text-sm">{brasilApiData.cnae_fiscal_descricao}</p>
                    </div>
                  </div>
                </div>

                <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-xl">
                  <h4 className="text-lg font-black text-slate-800 mb-6 flex items-center gap-2">
                    <div className="w-1.5 h-6 bg-emerald-500 rounded-full"></div>
                    CNAEs SECUNDÁRIOS
                  </h4>
                  <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                    {brasilApiData.cnaes_secundarios && brasilApiData.cnaes_secundarios.length > 0 ? (
                      brasilApiData.cnaes_secundarios.map((cnae, idx) => (
                        <div key={idx} className="flex gap-3 items-start pb-3 border-b border-slate-50 last:border-0">
                          <span className="bg-slate-200 text-slate-700 px-2 py-0.5 rounded text-[10px] font-mono font-bold shrink-0">{cnae.codigo}</span>
                          <p className="text-xs font-medium text-slate-600 leading-tight">{cnae.descricao}</p>
                        </div>
                      ))
                    ) : (
                      <p className="text-slate-400 text-sm italic">Nenhum CNAE secundário listado.</p>
                    )}
                  </div>
                </div>

                <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-xl">
                  <h4 className="text-lg font-black text-slate-800 mb-6 flex items-center gap-2">
                    <div className="w-1.5 h-6 bg-indigo-600 rounded-full"></div>
                    QUADRO SOCIETÁRIO (QSA)
                  </h4>
                  <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                    {brasilApiData.qsa && brasilApiData.qsa.length > 0 ? (
                      brasilApiData.qsa.map((socio, idx) => (
                        <div key={idx} className="p-4 bg-slate-50 rounded-xl space-y-1">
                          <p className="font-black text-slate-800 text-sm uppercase">{socio.nome_socio}</p>
                          <div className="flex justify-between items-center text-[10px] font-bold">
                            <span className="text-indigo-600 uppercase">{socio.qualificacao_socio}</span>
                            <span className="text-slate-400">Desde {socio.data_entrada_sociedade}</span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-slate-400 text-sm italic">Quadro societário não informado.</p>
                    )}
                  </div>
                </div>

                <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-xl">
                  <h4 className="text-lg font-black text-slate-800 mb-6 flex items-center gap-2">
                    <div className="w-1.5 h-6 bg-blue-600 rounded-full"></div>
                    CONTATO
                  </h4>
                  <div className="space-y-6">
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">E-mail</p>
                      <p className="font-bold text-indigo-600 truncate">{brasilApiData.email || "Não informado"}</p>
                    </div>
                    <div className="flex gap-8">
                      <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">DDD</p>
                        <p className="font-bold text-slate-700">{brasilApiData.ddd_telefone_1?.slice(0, 2) || "N/A"}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Telefone</p>
                        <p className="font-bold text-slate-700">{brasilApiData.ddd_telefone_1?.slice(2) || "Não informado"}</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-xl">
                  <h4 className="text-lg font-black text-slate-800 mb-6 flex items-center gap-2">
                    <div className="w-1.5 h-6 bg-violet-600 rounded-full"></div>
                    ENDEREÇO
                  </h4>
                  <div className="space-y-4">
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Logradouro</p>
                      <p className="font-bold text-slate-700 text-sm">{brasilApiData.logradouro}, {brasilApiData.numero}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Bairro</p>
                        <p className="font-bold text-slate-700 text-sm">{brasilApiData.bairro}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">CEP</p>
                        <p className="font-bold text-slate-700 text-sm">{brasilApiData.cep}</p>
                      </div>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Cidade / UF</p>
                      <p className="font-bold text-slate-700 text-sm">{brasilApiData.municipio} - {brasilApiData.uf}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : activeTab === 'tax-rules' ? (
          <div className="animate-in fade-in slide-in-from-bottom-6 duration-700">
            <div className="flex flex-col lg:flex-row gap-8">
              {/* Sidebar - Configuração */}
              <aside className="lg:w-80 shrink-0 space-y-6">
                <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-200/40">
                  <h3 className="text-sm font-black text-slate-800 mb-6 flex items-center gap-2 uppercase tracking-widest">
                    <ShieldCheck size={18} className="text-indigo-600" />
                    SIMULADOR 2026
                  </h3>

                  <div className="space-y-5">
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Atividades e Distribuição</label>
                        <button
                          onClick={() => setSimActivities([...simActivities, { activity: 'servico_intellectual', percentage: 0, label: 'Nova Atividade' }])}
                          className="text-[9px] font-black text-indigo-600 hover:text-indigo-800 transition-colors uppercase"
                        >
                          + Adicionar
                        </button>
                      </div>

                      <div className="space-y-3 mb-4">
                        {simActivities.length > 0 ? simActivities.map((act, idx) => (
                          <div key={idx} className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                            <div className="flex justify-between items-start mb-2">
                              <span className="text-[9px] font-black text-slate-400 uppercase truncate max-w-[120px]">{act.cnae ? `CNAE ${act.cnae}` : 'Manual'}</span>
                              <button
                                onClick={() => setSimActivities(simActivities.filter((_, i) => i !== idx))}
                                className="text-[9px] font-black text-rose-500 hover:text-rose-700"
                              >
                                REMOVER
                              </button>
                            </div>
                            <p className="text-[10px] font-bold text-slate-600 mb-2 leading-tight">{act.label}</p>
                            <div className="flex gap-2">
                              <select
                                value={act.activity}
                                onChange={(e: any) => {
                                  const newActs = [...simActivities];
                                  newActs[idx].activity = e.target.value;
                                  setSimActivities(newActs);
                                }}
                                className="flex-1 p-1.5 bg-white border border-slate-200 rounded-md text-[10px] font-bold text-slate-700 outline-none"
                              >
                                <option value="servico_intellectual">Intelectual (V/III)</option>
                                <option value="servico_geral">Geral (III)</option>
                                <option value="comercio">Comércio (I)</option>
                                <option value="industria">Indústria (II)</option>
                                <option value="hospitalar">Hospitalar</option>
                              </select>
                              <div className="w-20 relative">
                                <input
                                  type="number"
                                  value={act.percentage}
                                  onChange={(e) => {
                                    const newActs = [...simActivities];
                                    newActs[idx].percentage = Number(e.target.value);
                                    setSimActivities(newActs);
                                  }}
                                  className="w-full p-1.5 bg-white border border-slate-200 rounded-md text-[10px] font-bold text-slate-700 outline-none pr-5"
                                />
                                <span className="absolute right-1.5 top-1.5 text-[10px] font-bold text-slate-400">%</span>
                              </div>
                            </div>
                          </div>
                        )) : (
                          <div className="p-3 bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl text-center">
                            <p className="text-[10px] font-bold text-slate-400">Nenhuma atividade selecionada</p>
                          </div>
                        )}
                      </div>

                      {simActivities.length === 0 && (
                        <select
                          value={simActivity}
                          onChange={(e: any) => setSimActivity(e.target.value)}
                          className="w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-xl text-sm font-bold text-slate-700 focus:border-indigo-500 transition-all outline-none"
                        >
                          <option value="servico_intellectual">Serviços Intelectuais (Anexo V/III)</option>
                          <option value="servico_geral">Serviços Gerais (Anexo III)</option>
                          <option value="comercio">Comércio (Anexo I)</option>
                          <option value="industria">Indústria (Anexo II)</option>
                          <option value="hospitalar">Serviços Hospitalares</option>
                        </select>
                      )}
                    </div>

                    <div>
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-2">Faturamento Acumulado (RBT12)</label>
                      <input
                        type="text"
                        value={formatRawToCurrency(simRbt12 || totalBilling)}
                        onChange={(e) => setSimRbt12(parseCurrencyToNumber(e.target.value))}
                        className="w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-xl text-sm font-bold text-slate-700 focus:border-indigo-500 transition-all outline-none"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Média Faturamento Mensal</label>
                        <div className="flex gap-1">
                          <button onClick={() => setSimMonthlyBilling(Math.round(statsMetrics.billing.avg))} className="px-2 py-0.5 text-[8px] font-black bg-slate-100 hover:bg-indigo-100 text-slate-500 hover:text-indigo-600 rounded-md transition-colors uppercase">Média</button>
                          <button onClick={() => setSimMonthlyBilling(Math.round(statsMetrics.billing.latest))} className="px-2 py-0.5 text-[8px] font-black bg-slate-100 hover:bg-indigo-100 text-slate-500 hover:text-indigo-600 rounded-md transition-colors uppercase">Último</button>
                          <button onClick={() => setSimMonthlyBilling(Math.round(statsMetrics.billing.median))} className="px-2 py-0.5 text-[8px] font-black bg-slate-100 hover:bg-indigo-100 text-slate-500 hover:text-indigo-600 rounded-md transition-colors uppercase">Mediana</button>
                        </div>
                      </div>
                      <input
                        type="text"
                        value={formatRawToCurrency(simMonthlyBilling || statsMetrics.billing.avg)}
                        onChange={(e) => setSimMonthlyBilling(parseCurrencyToNumber(e.target.value))}
                        className="w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-xl text-sm font-bold text-slate-700 focus:border-indigo-500 transition-all outline-none"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Média Folha + Pró-Labore</label>
                        <div className="flex gap-1">
                          <button onClick={() => setSimMonthlyPayroll(Math.round(statsMetrics.payroll.avg))} className="px-2 py-0.5 text-[8px] font-black bg-slate-100 hover:bg-indigo-100 text-slate-500 hover:text-indigo-600 rounded-md transition-colors uppercase">Média</button>
                          <button onClick={() => setSimMonthlyPayroll(Math.round(statsMetrics.payroll.latest))} className="px-2 py-0.5 text-[8px] font-black bg-slate-100 hover:bg-indigo-100 text-slate-500 hover:text-indigo-600 rounded-md transition-colors uppercase">Último</button>
                          <button onClick={() => setSimMonthlyPayroll(Math.round(statsMetrics.payroll.median))} className="px-2 py-0.5 text-[8px] font-black bg-slate-100 hover:bg-indigo-100 text-slate-500 hover:text-indigo-600 rounded-md transition-colors uppercase">Mediana</button>
                        </div>
                      </div>
                      <input
                        type="text"
                        value={formatRawToCurrency(simMonthlyPayroll || statsMetrics.payroll.avg)}
                        onChange={(e) => setSimMonthlyPayroll(parseCurrencyToNumber(e.target.value))}
                        className="w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-xl text-sm font-bold text-slate-700 focus:border-indigo-500 transition-all outline-none"
                      />
                    </div>

                    <div className="pt-4 border-t border-slate-50 space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Perfil de Cliente B2B</span>
                        <button
                          onClick={() => setSimIsB2B(!simIsB2B)}
                          className={`w-10 h-5 rounded-full relative transition-all ${simIsB2B ? 'bg-indigo-600' : 'bg-slate-200'}`}
                        >
                          <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${simIsB2B ? 'right-1' : 'left-1'}`}></div>
                        </button>
                      </div>

                      <div>
                        <div className="flex justify-between items-center mb-1">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Alíquota ISSQN (LP)</label>
                          <span className="text-[10px] font-black text-indigo-600">{(simIssRate * 100).toFixed(2)}%</span>
                        </div>
                        <input
                          type="range"
                          min="0.02"
                          max="0.05"
                          step="0.0001"
                          value={simIssRate}
                          onChange={(e) => setSimIssRate(Number(e.target.value))}
                          className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                        />
                        <div className="flex justify-between mt-1">
                          <span className="text-[8px] font-bold text-slate-400">2%</span>
                          <span className="text-[8px] font-bold text-slate-400">5%</span>
                        </div>
                      </div>

                      <p className="text-[9px] text-slate-400 font-medium">Configure a alíquota de ISS do seu município para o Lucro Presumido.</p>
                    </div>
                  </div>
                </div>

                <div className="bg-gradient-to-br from-indigo-600 to-violet-700 p-6 rounded-[2rem] text-white shadow-xl shadow-indigo-200">
                  <h4 className="text-xs font-black uppercase tracking-widest mb-4 flex items-center gap-2">
                    <Zap size={16} />
                    Insight Planejador
                  </h4>
                  <p className="text-sm font-bold mb-4 leading-relaxed">
                    Recomendamos: <span className="underline decoration-indigo-300 underline-offset-4">{taxSimulation.sugestao}</span>
                  </p>
                  <div className="text-[10px] bg-white/10 p-3 rounded-xl border border-white/10 font-medium">
                    {taxSimulation.lucroPresumido.isLC224Applied
                      ? "⚠️ LC 224/2025: Faturamento > 5M ativa gatilho de +10% na presunção em 2026."
                      : "Sua empresa está abaixo do gatilho da LC 224 para 2026."}
                  </div>
                </div>
              </aside>

              {/* Main Content - Dashboard */}
              <div className="flex-1 space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Card Simples Nacional */}
                  <div className={`bg-white p-8 rounded-[2.5rem] border-2 transition-all ${taxSimulation.sugestao.includes("Simples") ? 'border-emerald-500 ring-4 ring-emerald-50' : 'border-slate-100 shadow-xl shadow-slate-200/40'}`}>
                    <div className="flex justify-between items-start mb-8">
                      <div>
                        <div className="bg-indigo-50 text-indigo-600 w-12 h-12 rounded-2xl flex items-center justify-center mb-4">
                          <Calculator size={24} />
                        </div>
                        <h3 className="text-2xl font-black text-slate-800">Simples Nacional</h3>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Regime Unificado</p>
                      </div>
                      <div className="text-right">
                        <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${taxSimulation.simples.elegivel ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                          {taxSimulation.simples.elegivel ? 'ELEGÍVEL' : 'IMPEDIDO'}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-6">
                      <div className="flex justify-between items-end">
                        <div>
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Anexo Sugerido</p>
                          <p className="text-lg font-black text-slate-800">Anexo {taxSimulation.simples.anexo}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Alíquota Efetiva</p>
                          <p className="text-lg font-black text-indigo-600">{taxSimulation.simples.aliquotaEfetiva.toFixed(2)}%</p>
                        </div>
                      </div>

                      <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex justify-between items-center">
                        <div>
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">DAS Estimado Mensal</p>
                          <p className="text-xl font-black text-slate-800">{taxSimulation.simples.dasTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Fator R Atual</p>
                          <p className={`text-sm font-black ${taxSimulation.simples.fatorR! >= 28 ? 'text-emerald-600' : 'text-rose-600'}`}>{taxSimulation.simples.fatorR?.toFixed(1)}%</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Card Lucro Presumido */}
                  <div className={`bg-white p-8 rounded-[2.5rem] border-2 transition-all ${taxSimulation.sugestao.includes("Presumido") ? 'border-emerald-500 ring-4 ring-emerald-50' : 'border-slate-100 shadow-xl shadow-slate-200/40'}`}>
                    <div className="flex justify-between items-start mb-8">
                      <div>
                        <div className="bg-violet-50 text-violet-600 w-12 h-12 rounded-2xl flex items-center justify-center mb-4">
                          <Building2 size={24} />
                        </div>
                        <h3 className="text-2xl font-black text-slate-800">Lucro Presumido</h3>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Regime Arbitrado</p>
                      </div>
                      <div className="text-right">
                        <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${taxSimulation.lucroPresumido.elegivel ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                          {taxSimulation.lucroPresumido.elegivel ? 'ELEGÍVEL' : 'IMPEDIDO'}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-6">
                      <div className="flex justify-between items-end">
                        <div>
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Presunção Serviços</p>
                          <p className="text-lg font-black text-slate-800">{taxSimulation.lucroPresumido.presuncaoirpj.toFixed(1)}%</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Alíquota Efetiva</p>
                          <p className="text-lg font-black text-indigo-600">{taxSimulation.lucroPresumido.aliquotaEfetiva.toFixed(2)}%</p>
                        </div>
                      </div>

                      <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex justify-between items-center">
                        <div>
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Total Impostos/Mês</p>
                          <p className="text-xl font-black text-slate-800">{taxSimulation.lucroPresumido.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                        </div>
                        <div className="text-right text-[9px] space-y-0.5 font-bold text-slate-400">
                          <p>PIS/COFIN: 3.65%</p>
                          <p>ISSQN (LP): {(simIssRate * 100).toFixed(1)}%</p>
                          <p>IR/CS: {(taxSimulation.lucroPresumido.aliquotaEfetiva - 3.65 - (simIssRate * 100)).toFixed(2)}%</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Timeline Transição Reforma */}
                <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/40">
                  <h3 className="text-xl font-black text-slate-800 mb-8 flex items-center gap-3">
                    <div className="w-1.5 h-6 bg-indigo-600 rounded-full"></div>
                    LINHA DO TEMPO: REFORMA TRIBUTÁRIA
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-6 relative">
                    <div className="hidden md:block absolute top-[52px] left-0 right-0 h-1 bg-slate-100 z-0"></div>

                    <TimelineStep
                      year="2026"
                      title="Fase de Teste"
                      desc="CBS (0.9%) + IBS (0.1%) incidem sobre o faturamento. Créditos em teste."
                      active
                      icon={<Zap size={18} />}
                    />
                    <TimelineStep
                      year="2027"
                      title="CBS Plena"
                      desc="Extinção total do PIS/COFINS. Início do crédito financeiro pleno."
                      icon={<ShieldCheck size={18} />}
                    />
                    <TimelineStep
                      year="2029"
                      title="Transição IBS"
                      desc="Redução gradual do ICMS/ISS. Aumento proporcional do IBS."
                      icon={<TrendingDown size={18} />}
                    />
                    <TimelineStep
                      year="2033"
                      title="Sistema Pleno"
                      desc="IBS e CBS substituem totalmente os 5 tributos antigos."
                      icon={<Clock size={18} />}
                    />
                  </div>

                  <div className="mt-10 p-6 bg-indigo-50/50 border border-indigo-100 rounded-[2rem] flex flex-col md:flex-row gap-8 items-center">
                    <div className="flex-1">
                      <h4 className="font-black text-indigo-900 text-sm mb-2 uppercase tracking-tight">Impacto em 2026 (CBS + IBS)</h4>
                      <p className="text-[11px] text-indigo-700 font-medium leading-relaxed">
                        Em 2026, além do DAS ou LP, haverá a incidência de 1% a título de teste do novo IVA.
                        As empresas que vendem para outras empresas (B2B) devem analisar o regime híbrido para transferir créditos integrais.
                      </p>
                    </div>
                    <div className="bg-white p-4 rounded-2xl border border-indigo-100 shadow-sm text-center min-w-[150px]">
                      <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Custo Adicional</p>
                      <p className="text-xl font-black text-indigo-600">
                        {taxSimulation.reforma2026.cbs_ibs.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </p>
                      <p className="text-[9px] font-bold text-slate-500">sobre fat. mensal</p>
                    </div>
                  </div>
                </div>

                {/* Checklist de Prontidão */}
                <div className="bg-slate-900 rounded-[2.5rem] p-10 text-white relative overflow-hidden">
                  <div className="absolute right-0 bottom-0 opacity-10 translate-x-1/4 translate-y-1/4">
                    <Briefcase size={300} />
                  </div>
                  <div className="relative z-10">
                    <h3 className="text-2xl font-black mb-2">Checklist de Prontidão Tributária</h3>
                    <p className="text-slate-400 text-sm font-medium mb-8">Avalie o preparo da sua empresa para as mudanças de 2025/2026</p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <CheckItem label="Revisão de fornecedores (geração de créditos IVA)" score={8} />
                      <CheckItem label="Adequação de sistemas ERP e Notas Fiscais" score={4} />
                      <CheckItem label="Mapeamento de clientes B2B vs B2C" score={simIsB2B ? 10 : 2} />
                      <CheckItem label="Simulação de nova precificação (Split Payment)" score={3} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : activeTab === 'calculation-memory' ? (
          <div className="animate-in fade-in slide-in-from-bottom-6 duration-700 space-y-8">
            <div className="flex items-center gap-4 mb-8">
              <div className="p-4 bg-indigo-600 text-white rounded-[2rem] shadow-xl shadow-indigo-100">
                <FileText size={32} />
              </div>
              <div>
                <h2 className="text-3xl font-black text-slate-800 tracking-tight">Memória de Cálculo</h2>
                <p className="text-slate-500 font-medium">Detalhamento matemático do planejamento tributário</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Simples Nacional Breakdown */}
              <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-xl shadow-slate-200/40">
                <h3 className="text-xl font-black text-slate-800 mb-8 flex items-center gap-3">
                  <div className="w-1.5 h-6 bg-indigo-600 rounded-full"></div>
                  SIMPLES NACIONAL
                </h3>

                <div className="space-y-6">
                  <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Fórmula da Alíquota Efetiva</p>
                    <div className="text-sm font-mono text-indigo-600 bg-white p-4 rounded-xl border border-indigo-50 mb-4 overflow-x-auto">
                      {"( (RBT12 * Alíq. Nominal) - Parcela a Deduzir ) / RBT12"}
                    </div>
                    <div className="space-y-3">
                      <div className="flex justify-between text-xs font-bold">
                        <span className="text-slate-500">RBT12 (Faturamento 12m)</span>
                        <span className="text-slate-800">{(simRbt12 || totalBilling).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                      </div>
                      <div className="flex justify-between text-xs font-bold">
                        <span className="text-slate-500">Faturamento Mensal Utilizado</span>
                        <span className="text-slate-800">{(simMonthlyBilling || statsMetrics.billing.avg).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                      </div>
                      <div className="flex justify-between text-xs font-bold">
                        <span className="text-slate-500">Alíquota Nominal</span>
                        <span className="text-slate-800">{taxSimulation.simples.aliquotaNominal.toFixed(2)}%</span>
                      </div>
                      <div className="flex justify-between text-xs font-bold">
                        <span className="text-slate-500">Parcela a Deduzir</span>
                        <span className="text-slate-800">{taxSimulation.simples.parcelaDeduzir.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                      </div>
                      <div className="flex justify-between text-xs font-bold">
                        <span className="text-slate-500">Anexo Sugerido</span>
                        <span className="text-slate-800">Anexo {taxSimulation.simples.anexo}</span>
                      </div>
                      <div className="flex justify-between text-xs font-bold border-t border-slate-200 pt-3">
                        <span className="text-slate-500 italic">Alíquota Efetiva Apurada</span>
                        <span className="text-indigo-600">{taxSimulation.simples.aliquotaEfetiva.toFixed(2)}%</span>
                      </div>
                    </div>
                  </div>

                  <div className="p-6 bg-indigo-600 rounded-3xl text-white shadow-lg shadow-indigo-100">
                    <p className="text-[10px] font-black text-indigo-200 uppercase tracking-widest mb-2">Imposto Mensal (DAS)</p>
                    <div className="flex justify-between items-end">
                      <div>
                        <p className="text-xs font-medium text-indigo-100">Fat. Simulado x Alíq. Efetiva</p>
                        <p className="text-2xl font-black mt-1">
                          {taxSimulation.simples.dasTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-black text-indigo-200 uppercase">Fator R</p>
                        <p className="text-sm font-black">{taxSimulation.simples.fatorR?.toFixed(1)}%</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Lucro Presumido Breakdown */}
              <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-xl shadow-slate-200/40">
                <h3 className="text-xl font-black text-slate-800 mb-8 flex items-center gap-3">
                  <div className="w-1.5 h-6 bg-violet-600 rounded-full"></div>
                  LUCRO PRESUMIDO
                </h3>

                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 text-center">
                      <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Presunção IR</p>
                      <p className="text-lg font-black text-slate-800">{taxSimulation.lucroPresumido.presuncaoirpj.toFixed(1)}%</p>
                    </div>
                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 text-center">
                      <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Presunção CSLL</p>
                      <p className="text-lg font-black text-slate-800">{(taxSimulation.lucroPresumido.presuncaoirpj === 32 || taxSimulation.lucroPresumido.presuncaoirpj === 35.2) ? taxSimulation.lucroPresumido.presuncaoirpj.toFixed(1) : (taxSimulation.lucroPresumido.presuncaoirpj / 8 * 12).toFixed(1)}%</p>
                    </div>
                  </div>

                  <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100 space-y-3">
                    <div className="flex justify-between text-xs font-bold">
                      <span className="text-slate-500">Faturamento Mensal Utilizado</span>
                      <span className="text-slate-800">{(simMonthlyBilling || statsMetrics.billing.avg).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                    </div>

                    {/* IRPJ breakdown */}
                    <div className="flex justify-between text-xs font-bold pt-2 border-t border-slate-100">
                      <span className="text-slate-500">IRPJ (15%)</span>
                      <div className="text-right">
                        <p className="text-slate-800">{((simMonthlyBilling || statsMetrics.billing.avg) * (taxSimulation.lucroPresumido.presuncaoirpj / 100) * 0.15).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                        <p className="text-[10px] text-indigo-600 font-medium">Aliq. Ef: {(((simMonthlyBilling || statsMetrics.billing.avg) * (taxSimulation.lucroPresumido.presuncaoirpj / 100) * 0.15) / (simMonthlyBilling || statsMetrics.billing.avg) * 100).toFixed(2)}%</p>
                      </div>
                    </div>

                    {((simMonthlyBilling || statsMetrics.billing.avg) * (taxSimulation.lucroPresumido.presuncaoirpj / 100)) > 20000 && (
                      <div className="flex justify-between text-xs font-bold">
                        <span className="text-slate-500">Adicional IRPJ (10%)</span>
                        <div className="text-right">
                          <p className="text-slate-800">{(((simMonthlyBilling || statsMetrics.billing.avg) * (taxSimulation.lucroPresumido.presuncaoirpj / 100) - 20000) * 0.10).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                          <p className="text-[10px] text-indigo-600 font-medium">Aliq. Ef: {((((simMonthlyBilling || statsMetrics.billing.avg) * (taxSimulation.lucroPresumido.presuncaoirpj / 100) - 20000) * 0.10) / (simMonthlyBilling || statsMetrics.billing.avg) * 100).toFixed(2)}%</p>
                        </div>
                      </div>
                    )}

                    <div className="flex justify-between text-xs font-bold">
                      <span className="text-slate-500">CSLL (9%)</span>
                      <div className="text-right">
                        <p className="text-slate-800">{taxSimulation.lucroPresumido.csll.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                        <p className="text-[10px] text-indigo-600 font-medium">Aliq. Ef: {(taxSimulation.lucroPresumido.csll / (simMonthlyBilling || statsMetrics.billing.avg) * 100).toFixed(2)}%</p>
                      </div>
                    </div>

                    <div className="flex justify-between text-xs font-bold pt-2 border-t border-slate-100">
                      <span className="text-slate-500">PIS (0.65%)</span>
                      <div className="text-right">
                        <p className="text-slate-800">{((simMonthlyBilling || statsMetrics.billing.avg) * 0.0065).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                        <p className="text-[10px] text-indigo-600 font-medium">Aliq. Ef: 0.65%</p>
                      </div>
                    </div>

                    <div className="flex justify-between text-xs font-bold">
                      <span className="text-slate-500">COFINS (3%)</span>
                      <div className="text-right">
                        <p className="text-slate-800">{((simMonthlyBilling || statsMetrics.billing.avg) * 0.03).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                        <p className="text-[10px] text-indigo-600 font-medium">Aliq. Ef: 3.00%</p>
                      </div>
                    </div>

                    <div className="flex justify-between text-xs font-bold">
                      <span className="text-slate-500">ISSQN ({(simIssRate * 100).toFixed(1)}%)</span>
                      <div className="text-right">
                        <p className="text-slate-800">{taxSimulation.lucroPresumido.issqn.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                        <p className="text-[10px] text-indigo-600 font-medium">Aliq. Ef: {(simIssRate * 100).toFixed(2)}%</p>
                      </div>
                    </div>

                    <div className="flex justify-between text-sm font-black border-t border-indigo-200 pt-3 text-indigo-600">
                      <span>TOTAL LUCRO PRESUMIDO</span>
                      <div className="text-right">
                        <span>{taxSimulation.lucroPresumido.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                        <p className="text-xs font-black">Efetiva Total: {taxSimulation.lucroPresumido.aliquotaEfetiva.toFixed(2)}%</p>
                      </div>
                    </div>
                  </div>

                  {taxSimulation.lucroPresumido.isLC224Applied && (
                    <div className="p-4 bg-rose-50 rounded-2xl border border-rose-100 flex items-start gap-3">
                      <AlertCircle className="text-rose-600 shrink-0" size={18} />
                      <p className="text-[10px] text-rose-800 font-bold leading-tight">
                        Regra 2026 (LC 224) aplicada: Majorada presunção em 10% devido ao faturamento superior a R$ 5 Mi.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Reforma 2026 Memory */}
              <div className="bg-slate-900 p-10 rounded-[3rem] text-white lg:col-span-2 relative overflow-hidden">
                <div className="absolute right-0 top-0 opacity-10 -translate-y-1/4 translate-x-1/4">
                  <Zap size={200} />
                </div>
                <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-8">
                  <div className="flex-1">
                    <h3 className="text-xl font-black mb-4 flex items-center gap-3">
                      <div className="w-1.5 h-6 bg-indigo-500 rounded-full"></div>
                      REFORMA TRIBUTÁRIA (FASE 2026)
                    </h3>
                    <p className="text-slate-400 text-sm font-medium max-w-xl">
                      Nos meses de 2026, as empresas recolherão uma alíquota de teste de 1% (0.9% CBS + 0.1% IBS) sobre o faturamento, adicional ao regime normal.
                    </p>
                  </div>
                  <div className="bg-white/10 p-6 rounded-3xl border border-white/10 text-center min-w-[250px]">
                    <p className="text-[10px] font-black text-indigo-300 uppercase tracking-widest mb-1">Memória de Cálculo (Teste)</p>
                    <p className="text-xs font-bold text-slate-300 mb-4">Faturamento Mensal x 1.0%</p>
                    <div className="flex justify-between items-center bg-white/5 p-4 rounded-xl">
                      <span className="text-xs font-bold text-slate-400">Total Adicional</span>
                      <span className="text-xl font-black text-indigo-400">
                        {taxSimulation.reforma2026.cbs_ibs.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : activeTab === 'report' ? (
          <div className="report-container pb-20">
            <div className="max-w-5xl mx-auto">
              {/* Toolbar */}
              <div className="flex justify-between items-center mb-10 no-print">
                <button
                  onClick={() => setActiveTab('analysis')}
                  className="text-slate-500 hover:text-indigo-600 font-bold flex items-center gap-2 transition-colors"
                >
                  <Search size={18} /> Voltar para Análise
                </button>
                <button
                  onClick={() => window.print()}
                  className="bg-slate-900 text-white px-8 py-3 rounded-xl font-black shadow-xl hover:bg-slate-800 transition-all flex items-center gap-3"
                >
                  <FileText size={20} /> Exportar como PDF (A4)
                </button>
              </div>

              {/* A4 Content Area */}
              <div className="a4-page print-area">
                <div className="watermark-text">Jonatan Moraes</div>
                {/* Header Section */}
                <div className="report-header">
                  <div className="flex items-center gap-2 mb-4">
                    <span className="text-xl">📄</span>
                    <h1 className="text-xl font-black text-slate-800 uppercase tracking-tight">
                      Relatório de Inteligência e Planejamento Tributário
                    </h1>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-y-6 text-sm">
                    <div className="report-subtitle">
                      Preparado por: <span className="text-slate-900">equipe fiscal da Corporação Contábil</span>
                    </div>
                    <div className="report-subtitle md:text-right">
                      Data: <span className="text-slate-900">{new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                    </div>
                    <div className="report-subtitle">
                      <div className="mb-1">Cliente: <span className="text-slate-900 font-extrabold">{companyInfo.name || brasilApiData?.razao_social || "NÃO IDENTIFICADO"}</span></div>
                      <div>CNPJ: <span className="font-mono text-slate-900">{companyInfo.cnpj || brasilApiData?.cnpj || "00.000.000/0000-00"}</span></div>
                    </div>
                  </div>
                </div>

                {/* 1. Sumário Executivo */}
                <h2 className="report-section-header">1. Sumário Executivo</h2>
                <p className="report-body-text">
                  Este diagnóstico estratégico avalia a viabilidade fiscal da empresa e traça o plano de contingência para a virada do sistema tributário nacional.
                  Com faturamento anual de <strong>{(simRbt12 || totalBilling).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong>, definimos que o cenário de <strong>maior eficiência</strong> é o {taxSimulation.sugestao.includes("Simples") ? "Simples Nacional" : "Lucro Presumido"}.
                </p>

                {/* Recomendação Principal */}
                <div className="recommendation-box">
                  <div className="flex items-center gap-2 mb-4">
                    <span className="text-xl">📊</span>
                    <h3 className="recommendation-title">Parecer de Inteligência</h3>
                  </div>
                  <p className="report-body-text mb-4">
                    {taxSimulation.sugestao.includes("Simples") ? (
                      <>A análise técnica conclui que a <strong>manutenção no Simples Nacional</strong> é a estratégia vencedora. Este regime oferece a menor carga tributária efetiva e simplifica a gestão acessória, permitindo foco total na operação do negócio.</>
                    ) : (
                      <>Identificamos que a <strong>migração para o Lucro Presumido</strong> é o caminho mais rentável. No patamar atual de faturamento e estrutura de custos, este regime supera a eficiência do Simples Nacional, maximizando a lucratividade líquida.</>
                    )}
                  </p>
                  <ul className="economy-list">
                    <li className="economy-item">
                      • Vantagem Mensal: {Math.abs(taxSimulation.simples.dasTotal - taxSimulation.lucroPresumido.total).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </li>
                    <li className="economy-item text-slate-900">
                      • Ganho de Eficiência Anual: {(Math.abs(taxSimulation.simples.dasTotal - taxSimulation.lucroPresumido.total) * 12).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </li>
                  </ul>
                </div>

                {/* 2. Análise Comparativa */}
                <hr className="border-slate-100 my-5" />
                <h2 className="report-section-header">2. Comparativo de Performance Fiscal</h2>
                <p className="report-body-text mb-2">
                  Detalhamos abaixo a performance tributária para o faturamento mensal projetado de <strong>{(simMonthlyBilling || statsMetrics.billing.avg).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong>.
                </p>


                <table className="modern-table">
                  <thead>
                    <tr>
                      <th>Regime sob Análise</th>
                      <th>Alíquota Efetiva</th>
                      <th>Encargo Mensal</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="text-slate-900">Simples Nacional (Anexo {taxSimulation.simples.anexo})</td>
                      <td className="text-slate-900">{taxSimulation.simples.aliquotaEfetiva.toFixed(2)}%</td>
                      <td className="text-slate-900">{taxSimulation.simples.dasTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                    </tr>
                    <tr>
                      <td className="text-slate-500">Lucro Presumido</td>
                      <td className="text-slate-500">{taxSimulation.lucroPresumido.aliquotaEfetiva.toFixed(2)}%</td>
                      <td className="text-slate-500">{taxSimulation.lucroPresumido.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                    </tr>
                  </tbody>
                </table>


                <hr className="border-slate-100 my-5" />

                {/* 3. Transição 2026 */}
                <h2 className="report-section-header">3. Reforma Tributária: Período de Transição (2026)</h2>
                <p className="report-body-text">
                  O ano de 2026 marcará o início da Contribuição sobre Bens e Serviços (CBS) e do Imposto sobre Bens e Serviços (IBS).
                </p>
                <div className="recommendation-box border-indigo-100 bg-indigo-50/20 mb-8">
                  <div className="flex items-center gap-2 mb-2 text-indigo-700">
                    <AlertCircle size={18} />
                    <h4 className="font-bold">Status: Informativo e Não Oneroso</h4>
                  </div>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    Para o ano de 2026, as alíquotas de <strong>0,9% (CBS) e 0,1% (IBS)</strong> terão caráter predominantemente informativo. <strong>Não haverá onerosidade financeira adicional</strong> para os contribuintes que realizarem o correto destaque destes tributos em seus documentos fiscais. O objetivo deste período é o ajuste de sistemas e a mensuração da arrecadação.
                  </p>
                </div>


                <hr className="border-slate-100 my-5" />

                {/* 4. Gestão do Fator R - Apenas para Serviços Intelectuais */}
                {simActivity === 'servico_intellectual' && (
                  <div className="mb-12">
                    <h2 className="report-section-header">4. Análise Crítica: Gestão do Fator R</h2>
                    <div className="mb-8">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-lg">⚙️</span>
                        <h4 className="font-extrabold text-slate-800">Manutenção do Anexo III</h4>
                      </div>
                      <p className="report-body-text">
                        A manutenção do <strong>Fator R acima de 28%</strong> é a peça-chave para garantir a menor tributação no seu setor. Atualmente, seu Fator R está em <strong>{taxSimulation.simples.fatorR?.toFixed(1)}%</strong>.
                      </p>
                      <div className="p-5 bg-amber-50 border-l-4 border-amber-400 rounded-r-xl">
                        <p className="text-sm font-bold text-amber-800 mb-2">Riscos ao Enquadramento:</p>
                        <ul className="space-y-2 text-sm text-amber-900">
                          <li>• <strong>Queda na Folha:</strong> Reduções no Pró-labore ou desligamento de funcionários podem derrubar o índice para abaixo de 28%.</li>
                          <li>• <strong>Aumento de Faturamento:</strong> Crescimentos abruptos na receita sem o devido ajuste proporcional na folha também podem causar a migração para o oneroso Anexo V (início em 15,5%).</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                )}

                {/* 5. Roadmap Estratégico */}
                <hr className="border-slate-100 my-5" />
                <h2 className="report-section-header">{simActivity === 'servico_intellectual' ? '5.' : '4.'} Roadmap Estratégico e Próximos Passos</h2>
                <div className="mb-10">
                  <div className="flex items-center gap-2 mb-4">
                    <span className="text-lg">🛡️</span>
                    <h4 className="font-extrabold text-slate-800">Preparação 2026 → 2027</h4>
                  </div>
                  <p className="report-body-text">
                    Para evitar impactos financeiros na virada definitiva do sistema em 2027, todos os clientes devem iniciar as seguintes preparações em 2026:
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
                    <div className="p-4 border border-slate-100 rounded-xl">
                      <h5 className="font-black text-xs uppercase text-slate-400 mb-2">Infraestrutura</h5>
                      <p className="text-sm text-slate-700">Adaptação de sistemas <strong>B2B e B2C</strong> para cálculo e destaque de créditos fiscais.</p>
                    </div>
                    <div className="p-4 border border-slate-100 rounded-xl">
                      <h5 className="font-black text-xs uppercase text-slate-400 mb-2">Documentação</h5>
                      <p className="text-sm text-slate-700">Monitoramento rigoroso dos <strong>créditos de notas fiscais</strong> de entrada para compensação plena.</p>
                    </div>
                  </div>
                </div>

                <div className="p-8 bg-slate-900 rounded-[2rem] text-white text-center">
                  <h3 className="text-xl font-black mb-3 text-indigo-300">Apoio Especializado</h3>
                  <p className="text-slate-300 text-sm mb-6 max-w-lg mx-auto">
                    Não tome decisões críticas sozinho. A Reforma Tributária exige vigilância constante e ajustes precisos de rota.
                  </p>
                  <p className="text-md font-bold text-white">
                    Conte com nossa equipe de <span className="text-indigo-400 tracking-wider">CONSULTORES E ESPECIALISTAS</span> para sua transição.
                  </p>
                </div>

                <div className="report-footer-signature">
                  <div className="signature-line"></div>
                  <h4 className="signature-name">Jonatan Moraes</h4>
                  <p className="signature-title">Diretor Tributário & Co-Founder</p>
                  <p className="signature-contact">fiscal@corporacaocontabil.com.br</p>
                  <p className="signature-contact">17-2138-6050 — WhatsApp 17-3512-7600</p>
                </div>

                <p className="report-body-text font-black mt-20 border-t border-slate-900 pt-8 uppercase text-xs tracking-widest text-center">
                  Corporação Contábil — Inteligência para o Futuro Tributário
                </p>
              </div>
            </div>
          </div>
        ) : null}
      </main>

      <footer className="mt-20 p-8 text-center border-t border-slate-100 no-print">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-slate-400 text-xs font-bold tracking-widest uppercase">TanTax Inteligência Tributária 2005</p>
          <div className="flex gap-6">
            <a href="#" className="text-slate-400 hover:text-indigo-600 text-xs font-bold uppercase transition-colors">Termos</a>
            <a href="#" className="text-slate-400 hover:text-indigo-600 text-xs font-bold uppercase transition-colors">Privacidade</a>
            <a href="#" className="text-slate-400 hover:text-indigo-600 text-xs font-bold uppercase transition-colors">Suporte</a>
          </div>
        </div>
      </footer>
    </div>
  );
};

interface KpiCardProps {
  label: string;
  value: string;
  icon: React.ReactNode;
  subtext: string;
  color: string;
  highlight?: boolean;
}

const KpiCard: React.FC<KpiCardProps> = ({ label, value, icon, subtext, color, highlight }) => (
  <div className={`bg-white p-6 rounded-[2rem] border transition-all duration-300 ${highlight ? 'border-rose-200 ring-4 ring-rose-50' : 'border-slate-100 shadow-xl shadow-slate-200/50 hover:shadow-indigo-100 hover:-translate-y-1'}`}>
    <div className="flex justify-between items-start mb-5">
      <div className={`p-3 rounded-2xl ${color} shadow-sm`}>{icon}</div>
      <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center">
        <div className="w-1.5 h-1.5 bg-slate-300 rounded-full"></div>
      </div>
    </div>
    <p className="text-slate-400 text-[10px] font-black uppercase tracking-wider mb-1">{label}</p>
    <p className="text-2xl font-black text-slate-800 mb-2">{value}</p>
    <p className={`text-[11px] font-bold ${highlight ? 'text-rose-600' : 'text-slate-500'}`}>{subtext}</p>
  </div>
);

const TimelineStep: React.FC<{ year: string, title: string, desc: string, active?: boolean, icon: React.ReactNode }> = ({ year, title, desc, active, icon }) => (
  <div className="relative z-10">
    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-4 transition-all ${active ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'bg-slate-100 text-slate-400'}`}>
      {icon}
    </div>
    <p className={`text-sm font-black mb-1 ${active ? 'text-indigo-600' : 'text-slate-800'}`}>{year}: {title}</p>
    <p className="text-[10px] font-medium text-slate-500 leading-tight">{desc}</p>
  </div>
);

const CheckItem: React.FC<{ label: string, score: number }> = ({ label, score }) => (
  <div className="space-y-3">
    <div className="flex justify-between items-end">
      <p className="text-[11px] font-black uppercase tracking-tight text-slate-400">{label}</p>
      <p className="text-xs font-black text-white">{score}/10</p>
    </div>
    <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
      <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${score * 10}%` }}></div>
    </div>
  </div>
);

export default App;
