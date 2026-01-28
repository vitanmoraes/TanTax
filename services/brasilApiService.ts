
export interface BrasilAPI_CNAE {
    codigo: number;
    descricao: string;
}

export interface BrasilAPI_Socio {
    nome_socio: string;
    cnpj_cpf_do_socio: string;
    codigo_qualificacao_socio: number;
    qualificacao_socio: string;
    faixa_etaria: string;
    data_entrada_sociedade: string;
}

export interface BrasilAPI_CNPJ {
    cnpj: string;
    razao_social: string;
    nome_fantasia: string;
    situacao_cadastral: string;
    data_inicio_atividade: string;
    cnae_fiscal: number;
    cnae_fiscal_descricao: string;
    cnaes_secundarios: BrasilAPI_CNAE[];
    natureza_juridica: string;
    codigo_natureza_juridica: number;
    logradouro: string;
    numero: string;
    bairro: string;
    municipio: string;
    uf: string;
    cep: string;
    ddd_telefone_1: string;
    email: string;
    capital_social: number;
    opcao_pelo_simples: boolean | null;
    qsa: BrasilAPI_Socio[];
}

export async function fetchCNPJData(cnpj: string): Promise<BrasilAPI_CNPJ> {
    const sanitizedCNPJ = cnpj.replace(/\D/g, '');
    const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${sanitizedCNPJ}`);

    if (!response.ok) {
        if (response.status === 404) {
            throw new Error("CNPJ não encontrado.");
        }
        throw new Error("Erro ao consultar BrasilAPI.");
    }

    return response.json();
}
