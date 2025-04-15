// backend/src/interfaces/ExtractedFeedback.ts
import { FeedbackCategory } from "../models/Feedback";

/**
 * コメントから抽出されたフィードバック項目の型定義
 */
export interface ExtractedFeedback {
  feedback_type: "strength" | "improvement";
  category: string | FeedbackCategory;
  point: string;
  suggestion?: string;
  code_snippet?: string;
  reference_url?: string;
}
