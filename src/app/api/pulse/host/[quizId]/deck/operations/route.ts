import { pulseRoute } from "@/lib/api/pulse";
import { saveDeckOperations } from "@/lib/pulse/deckOperations";

type Context = { params: Promise<{ quizId: string }> };

export function POST(request: Request, context: Context) {
  return pulseRoute(request, async () => saveDeckOperations(request, (await context.params).quizId));
}
