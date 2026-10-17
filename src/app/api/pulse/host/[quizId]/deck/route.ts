import { pulseRoute } from "@/lib/api/pulse";
import { getDeck, saveDeck } from "@/lib/pulse/deckService";

type Context = { params: Promise<{ quizId: string }> };

export function GET(request: Request, context: Context) {
  return pulseRoute(request, async () => getDeck(request, (await context.params).quizId));
}
export function PUT(request: Request, context: Context) {
  return pulseRoute(request, async () => saveDeck(request, (await context.params).quizId));
}
