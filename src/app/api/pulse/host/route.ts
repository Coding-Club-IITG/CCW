import { pulseRoute } from "@/lib/api/pulse";
import { listHostQuizzes } from "@/lib/pulse/quizzes";

export function GET(request: Request) {
  return pulseRoute(request, () => listHostQuizzes(request));
}
