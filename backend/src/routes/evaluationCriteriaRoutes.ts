// backend/src/routes/evaluationCriteriaRoutes.ts
import express from "express";
import { EvaluationCriteriaController } from "../controllers/EvaluationCriteriaController";
import { authenticate, requireAdmin } from "../middlewares/authMiddleware";

const router = express.Router();
const evaluationCriteriaController = new EvaluationCriteriaController();

// すべてのルートに認証を適用
router.use(authenticate);

// 全ての評価基準を取得（管理者と一般ユーザー）
router.get("/", evaluationCriteriaController.getAllCriteria);

// 現在の年度の評価基準を取得（管理者と一般ユーザー）
router.get("/current", evaluationCriteriaController.getCurrentYearCriteria);

// 特定の年度の評価基準を取得（管理者と一般ユーザー）
router.get("/year/:year", evaluationCriteriaController.getCriteriaForYear);

// 全ての年度設定を取得（管理者と一般ユーザー）
router.get("/years", evaluationCriteriaController.getAllAcademicYears);

// 以下は管理者専用ルート
// 新しい評価基準を作成
router.post("/", requireAdmin, evaluationCriteriaController.createCriteria);

// 評価基準を更新
router.put("/:key", requireAdmin, evaluationCriteriaController.updateCriteria);

// 評価基準を無効化
router.delete(
  "/:key",
  requireAdmin,
  evaluationCriteriaController.deactivateCriteria
);

// 評価基準の表示順を一括更新
router.post(
  "/bulk-update",
  requireAdmin,
  evaluationCriteriaController.bulkUpdateCriteria
);

// 年度を作成・更新
router.post(
  "/years",
  requireAdmin,
  evaluationCriteriaController.createOrUpdateAcademicYear
);

// 年度別評価基準設定を更新
router.post(
  "/yearly-settings",
  requireAdmin,
  evaluationCriteriaController.updateYearlyCriteriaSettings
);

// AIによる評価基準生成
router.post(
  "/generate",
  requireAdmin,
  evaluationCriteriaController.generateCriteriaWithAI
);

// 評価基準の説明をAIで改善
router.post(
  "/:id/improve-description",
  requireAdmin,
  evaluationCriteriaController.improveCriteriaDescription
);

export default router;
