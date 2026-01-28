
export type AppActivity = 'comercio' | 'industria' | 'servico_geral' | 'servico_intellectual' | 'hospitalar';

export const CNAE_MAPPING: Record<string, AppActivity> = {
    // Comércio
    '45': 'comercio',
    '46': 'comercio',
    '47': 'comercio',
    // Indústria
    '10': 'industria', '11': 'industria', '12': 'industria', '13': 'industria', '14': 'industria',
    '15': 'industria', '16': 'industria', '17': 'industria', '18': 'industria', '19': 'industria',
    '20': 'industria', '21': 'industria', '22': 'industria', '23': 'industria', '24': 'industria',
    '25': 'industria', '26': 'industria', '27': 'industria', '28': 'industria', '29': 'industria',
    '30': 'industria', '31': 'industria', '32': 'industria', '33': 'industria',
    // Serviços Gerais
    '35': 'servico_geral', '36': 'servico_geral', '37': 'servico_geral', '38': 'servico_geral',
    '39': 'servico_geral', '41': 'servico_geral', '42': 'servico_geral', '43': 'servico_geral',
    '49': 'servico_geral', '50': 'servico_geral', '51': 'servico_geral', '52': 'servico_geral',
    '53': 'servico_geral', '55': 'servico_geral', '56': 'servico_geral', '77': 'servico_geral',
    '78': 'servico_geral', '79': 'servico_geral', '80': 'servico_geral', '81': 'servico_geral',
    '82': 'servico_geral', '90': 'servico_geral', '91': 'servico_geral', '92': 'servico_geral',
    '93': 'servico_geral', '94': 'servico_geral', '95': 'servico_geral', '96': 'servico_geral',
    // Serviços Intelectuais
    '62': 'servico_intellectual', '63': 'servico_intellectual', '69': 'servico_intellectual',
    '70': 'servico_intellectual', '71': 'servico_intellectual', '72': 'servico_intellectual',
    '73': 'servico_intellectual', '74': 'servico_intellectual', '75': 'servico_intellectual',
    '85': 'servico_intellectual',
    // Hospitalar
    '86': 'hospitalar'
};

export const mapCnaeToActivity = (cnaeCode: string): AppActivity => {
    const prefix = cnaeCode.substring(0, 2);
    return CNAE_MAPPING[prefix] || 'servico_intellectual'; // Default to intellectual if unknown
};

export const checkSimplesEligibility = (naturezaJuridica: string): { eligible: boolean; reason?: string } => {
    // 2011 - Sociedade Anônima Aberta
    // 2038 - Sociedade Anônima Fechada (depende, mas geralmente SA não entra no Simples facilmente sem regras específicas)
    if (naturezaJuridica.includes('2011') || naturezaJuridica.includes('2046')) {
        return { eligible: false, reason: 'Natureza Jurídica (S/A) impediva para Simples Nacional' };
    }
    return { eligible: true };
};
