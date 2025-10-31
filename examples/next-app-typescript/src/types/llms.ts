export type LLMSResponse = {
  llms: Array<{
    id: string;
    name: string;
    provider: string;
    isDefault: boolean;
  }>;
};

export type MyApiSuccessResponseBody<T> = T & {
  success: true;
  httpCode: string;
};
