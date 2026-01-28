
/**
 * TanTax Engine - Logica Tributaria 2024-2033
 */

export interface TaxResults {
    simples: {
        elegivel: boolean;
        anexo: string;
        aliquotaEfetiva: number;
        aliquotaNominal: number;
        parcelaDeduzir: number;
        dasTotal: number;
        fatorR?: number;
        motivoVenda?: string;
    };
    lucroPresumido: {
        elegivel: boolean;
        irpj: number;
        csll: number;
        pis: number;
        cofins: number;
        issqn: number;
        total: number;
        aliquotaEfetiva: number;
        presuncaoirpj: number;
        isLC224Applied: boolean;
    };
    reforma2026: {
        cbs_ibs: number;
        percentualReducao: number;
        fase: string;
    };
    folha: {
        inssPatronal: number;
        rat: number;
        terceiros: number;
        totalEncargos: number;
        percentualSobreFolha: number;
        isSimplesSubstituido: boolean;
    };
    sugestao: string;
}

// Tabelas simplificadas para cálculo de alíquota efetiva (Faixas Simples Nacional)
const SIMPLES_TABLE = {
    ANEXO_I: [
        { limite: 180000, aliquota: 0.04, deduzir: 0 },
        { limite: 360000, aliquota: 0.073, deduzir: 5940 },
        { limite: 720000, aliquota: 0.095, deduzir: 13860 },
        { limite: 1800000, aliquota: 0.107, deduzir: 22500 },
        { limite: 3600000, aliquota: 0.143, deduzir: 87300 },
        { limite: 4800000, aliquota: 0.19, deduzir: 378000 },
    ],
    ANEXO_III: [
        { limite: 180000, aliquota: 0.06, deduzir: 0 },
        { limite: 360000, aliquota: 0.112, deduzir: 9360 },
        { limite: 720000, aliquota: 0.135, deduzir: 17640 },
        { limite: 1800000, aliquota: 0.16, deduzir: 35640 },
        { limite: 3600000, aliquota: 0.21, deduzir: 125640 },
        { limite: 4800000, aliquota: 0.33, deduzir: 648000 },
    ],
    ANEXO_V: [
        { limite: 180000, aliquota: 0.155, deduzir: 0 },
        { limite: 360000, aliquota: 0.18, deduzir: 4500 },
        { limite: 720000, aliquota: 0.195, deduzir: 9900 },
        { limite: 1800000, aliquota: 0.205, deduzir: 17100 },
        { limite: 3600000, aliquota: 0.23, deduzir: 62100 },
        { limite: 4800000, aliquota: 0.305, deduzir: 540000 },
    ]
};

export function calculateTaxEngine(
    rbt12: number,
    monthlyBilling: number,
    monthlyPayroll: number, // Total (Salarios + Pro-Labore)
    activity: 'comercio' | 'industria' | 'servico_geral' | 'servico_intellectual' | 'hospitalar',
    isB2B: boolean,
    issRate: number = 0.05,
    ratRate: number = 0.02,
    terceirosRate: number = 0.058,
    monthlyProLabore: number = 0
): TaxResults {

    // 1. Lógica Fator R
    const monthlySalaries = Math.max(0, monthlyPayroll - monthlyProLabore);
    const massaSalarialComFGTS = (monthlySalaries * 1.08) + monthlyProLabore;
    const fatorR = rbt12 > 0 ? (massaSalarialComFGTS * 12) / rbt12 : 0;

    let simplesAnexo = "III";
    if (activity === 'servico_intellectual' || activity === 'hospitalar') {
        simplesAnexo = fatorR >= 0.28 ? "III" : "V";
    } else if (activity === 'comercio') {
        simplesAnexo = "I";
    }

    // 2. Cálculo Alíquota Efetiva Simples
    const table = simplesAnexo === "I" ? SIMPLES_TABLE.ANEXO_I :
        (simplesAnexo === "III" ? SIMPLES_TABLE.ANEXO_III : SIMPLES_TABLE.ANEXO_V);

    const bracket = table.find(b => rbt12 <= b.limite) || table[table.length - 1];
    const aliquotaEfetiva = rbt12 > 0 ? ((rbt12 * bracket.aliquota) - bracket.deduzir) / rbt12 : bracket.aliquota;

    const simplesTotal = monthlyBilling * aliquotaEfetiva;

    // 3. Lucro Presumido
    let presirpj = 0.32;
    let prescsll = 0.32;

    if (activity === 'comercio' || activity === 'industria') {
        presirpj = 0.08;
        prescsll = 0.12;
    } else if (activity === 'hospitalar') {
        presirpj = 0.08;
        prescsll = 0.12;
    }

    // LC 224/2025 - 2026 Rule: +10% on presumption if billing > 5M
    const isAbove5M = rbt12 > 5000000;
    if (isAbove5M) {
        presirpj = presirpj * 1.1;
        prescsll = prescsll * 1.1;
    }

    const baseIRPJ = monthlyBilling * presirpj;
    const baseCSLL = monthlyBilling * prescsll;

    const irpj = baseIRPJ * 0.15 + (baseIRPJ > 20000 ? (baseIRPJ - 20000) * 0.10 : 0);
    const csll = baseCSLL * 0.09;
    const pis = monthlyBilling * 0.0065;
    const cofins = monthlyBilling * 0.03;
    const issqn = (activity === 'servico_geral' || activity === 'servico_intellectual' || activity === 'hospitalar')
        ? monthlyBilling * issRate
        : 0;

    const lpTotal = irpj + csll + pis + cofins + issqn;

    // 4. Reforma Tributaria (Simulação 2026 - 1%)
    const cbs_ibs = monthlyBilling * 0.01;

    // Sugestão
    let sugestao = lpTotal < simplesTotal ? "Lucro Presumido" : "Simples Nacional";
    if (isB2B && sugestao === "Simples Nacional") {
        sugestao += " (Considere Regime Híbrido para B2B)";
    }

    const results: TaxResults = {
        simples: {
            elegivel: rbt12 <= 4800000,
            anexo: simplesAnexo,
            aliquotaEfetiva: aliquotaEfetiva * 100,
            aliquotaNominal: bracket.aliquota * 100,
            parcelaDeduzir: bracket.deduzir,
            dasTotal: simplesTotal,
            fatorR: fatorR * 100
        },
        lucroPresumido: {
            elegivel: rbt12 <= 78000000,
            irpj,
            csll,
            pis,
            cofins,
            issqn,
            total: lpTotal,
            aliquotaEfetiva: (lpTotal / monthlyBilling) * 100,
            presuncaoirpj: presirpj * 100,
            isLC224Applied: isAbove5M
        },
        reforma2026: {
            cbs_ibs,
            percentualReducao: 0, // Placeholder
            fase: "Teste (1%)"
        },
        folha: {
            inssPatronal: simplesAnexo === "IV" || lpTotal > 0 ? monthlyPayroll * 0.20 : 0,
            rat: simplesAnexo === "IV" || lpTotal > 0 ? monthlySalaries * ratRate : 0,
            terceiros: lpTotal > 0 ? monthlySalaries * terceirosRate : 0, // Simples Geral não paga terceiros
            totalEncargos: 0, // Calculated below
            percentualSobreFolha: 0,
            isSimplesSubstituido: simplesAnexo !== "IV"
        },
        sugestao
    };

    // Ajuste final dos totais de folha
    const isLP = lpTotal > 0;
    const isAnexoIV = simplesAnexo === "IV";

    if (isLP) {
        results.folha.totalEncargos = results.folha.inssPatronal + results.folha.rat + results.folha.terceiros;
    } else if (isAnexoIV) {
        results.folha.totalEncargos = results.folha.inssPatronal + results.folha.rat;
    } else {
        results.folha.totalEncargos = 0; // Outros anexos do simples o INSS patronal está no DAS
    }

    results.folha.percentualSobreFolha = monthlyPayroll > 0 ? (results.folha.totalEncargos / monthlyPayroll) * 100 : 0;

    return results;
}
