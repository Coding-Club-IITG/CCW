import type { AppResult } from "@/lib/api/result";

export async function responseResult<T = any>(
  response: Response,
): Promise<AppResult<T>> {
  return (await response.json()) as AppResult<T>;
}

export async function responseData<T = any>(response: Response): Promise<T> {
  const result = await responseResult<T>(response);
  if (!result.ok) throw new Error(result.error.message);
  return result.data;
}

export async function responseError(response: Response) {
  const result = await responseResult(response);
  if (result.ok) throw new Error("Expected an error result.");
  return result.error;
}
