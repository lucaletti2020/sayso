import { AzureOpenAI } from "openai";

export function getAzureOpenAI() {
  return new AzureOpenAI({
    endpoint: process.env.AZURE_OPENAI_ENDPOINT!,
    apiKey: process.env.AZURE_OPENAI_API_KEY!,
    apiVersion: process.env.AZURE_OPENAI_API_VERSION ?? "2024-12-01-preview",
    deployment: process.env.AZURE_OPENAI_DEPLOYMENT ?? "gpt-4o",
  });
}

export const DEPLOYMENT = process.env.AZURE_OPENAI_DEPLOYMENT ?? "gpt-4o";
