
import { GoogleGenAI, Type } from "@google/genai";
import { BillingRecord, PayrollRecord } from "../types";

const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY || '' });

const billingSchema = {
  type: Type.OBJECT,
  properties: {
    companyName: { type: Type.STRING },
    cnpj: { type: Type.STRING },
    records: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          month: { type: Type.STRING },
          year: { type: Type.NUMBER },
          services: { type: Type.NUMBER },
          total: { type: Type.NUMBER },
        },
        required: ["month", "year", "services", "total"],
      },
    },
  },
  required: ["companyName", "cnpj", "records"],
};

const payrollSchema = {
  type: Type.OBJECT,
  properties: {
    companyName: { type: Type.STRING },
    cnpj: { type: Type.STRING },
    records: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          type: { type: Type.STRING },
          category: { type: Type.STRING },
          competence: { type: Type.STRING },
          value: { type: Type.NUMBER },
        },
        required: ["type", "category", "competence", "value"],
      },
    },
  },
  required: ["companyName", "cnpj", "records"],
};

interface FileData {
  base64: string;
  mimeType: string;
}

export async function extractBillingData(file: FileData): Promise<{ companyName: string, cnpj: string, records: BillingRecord[] }> {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: {
      parts: [
        { inlineData: { data: file.base64, mimeType: file.mimeType } },
        { text: "Extraia todos os dados do relatório de faturamento mensal deste documento PDF/Imagem. Converta valores monetários para números (ex: 24.571,80 vira 24571.8). Certifique-se de capturar todos os meses listados na tabela de faturamento dos últimos 12 meses." }
      ]
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: billingSchema,
    },
  });

  return JSON.parse(response.text);
}

export async function extractPayrollData(file: FileData): Promise<{ companyName: string, cnpj: string, records: PayrollRecord[] }> {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: {
      parts: [
        { inlineData: { data: file.base64, mimeType: file.mimeType } },
        { text: "Extraia todos os dados de pagamento de folha deste documento PDF/Imagem. Categorize cada registro: se o tipo de cálculo for 'Empregador Mensal', a categoria é 'pro-labore'; para qualquer outro tipo (como 'Folha Mensal', 'Férias', etc), a categoria é 'salario'. Capture o tipo, a categoria, a competência (MM/YYYY) e o valor. Converta valores monetários para números." }
      ]
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: payrollSchema,
    },
  });

  return JSON.parse(response.text);
}
