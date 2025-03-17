// frontend/src/components/analytics/TraineeRankingTable.tsx
"use client";

import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ChevronDown,
  ChevronUp,
  ChevronDownSquare,
  ChevronUpSquare,
  SortAsc,
  SortDesc,
  Medal,
} from "lucide-react";
import React from "react";

interface Trainee {
  last_evaluation_date: string;
  avg_revision_count: any;
  most_common_issue: string;
  id: number;
  name: string;
  department: string;
  join_year: number;
  level: string;
  overall_score: number;
  code_quality_score: number;
  readability_score: number;
  efficiency_score: number;
  best_practices_score: number;
  evaluation_count: number;
  growth_rate: number;
}

interface TraineeRankingTableProps {
  trainees: Trainee[];
}

export function TraineeRankingTable({ trainees }: TraineeRankingTableProps) {
  const [sortField, setSortField] = useState<keyof Trainee>("overall_score");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [expandedTrainee, setExpandedTrainee] = useState<number | null>(null);

  // ソート処理
  const handleSort = (field: keyof Trainee) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  // ソートアイコンの表示
  const renderSortIcon = (field: keyof Trainee) => {
    if (sortField !== field) {
      return <SortAsc className="h-4 w-4 opacity-30" />;
    }
    return sortDirection === "asc" ? (
      <SortAsc className="h-4 w-4" />
    ) : (
      <SortDesc className="h-4 w-4" />
    );
  };

  // 詳細表示の切り替え
  const toggleDetails = (id: number) => {
    setExpandedTrainee(expandedTrainee === id ? null : id);
  };

  // 社員をソート
  const sortedTrainees = [...trainees].sort((a, b) => {
    const aValue = a[sortField];
    const bValue = b[sortField];

    if (typeof aValue === "string" && typeof bValue === "string") {
      return sortDirection === "asc"
        ? aValue.localeCompare(bValue)
        : bValue.localeCompare(aValue);
    }

    if (typeof aValue === "number" && typeof bValue === "number") {
      return sortDirection === "asc" ? aValue - bValue : bValue - aValue;
    }

    return 0;
  });

  // レベルに応じたバッジのカラーを取得
  const getLevelBadgeColor = (level: string) => {
    switch (level) {
      case "A":
        return "bg-green-100 text-green-800 hover:bg-green-200";
      case "B":
        return "bg-blue-100 text-blue-800 hover:bg-blue-200";
      case "C":
        return "bg-yellow-100 text-yellow-800 hover:bg-yellow-200";
      case "D":
        return "bg-orange-100 text-orange-800 hover:bg-orange-200";
      case "E":
        return "bg-red-100 text-red-800 hover:bg-red-200";
      default:
        return "";
    }
  };

  // ランキングのメダルを表示
  const renderRankingMedal = (index: number) => {
    if (index === 0) {
      return <Medal className="h-5 w-5 text-yellow-500" />;
    }
    if (index === 1) {
      return <Medal className="h-5 w-5 text-gray-400" />;
    }
    if (index === 2) {
      return <Medal className="h-5 w-5 text-amber-700" />;
    }
    return <span className="ml-1">{index + 1}</span>;
  };

  // スコアの視覚化
  const renderScoreBar = (score: number) => {
    const percentage = Math.min(100, Math.max(0, score * 10)); // 0-10 のスコアを 0-100% に変換
    const color =
      score >= 9
        ? "bg-green-500"
        : score >= 7
        ? "bg-blue-500"
        : score >= 5
        ? "bg-yellow-500"
        : score >= 3
        ? "bg-orange-500"
        : "bg-red-500";

    return (
      <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
        <div
          className={`h-2.5 rounded-full ${color}`}
          style={{ width: `${percentage}%` }}
        ></div>
      </div>
    );
  };

  // データがない場合のメッセージ
  if (trainees.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">データがありません</div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">順位</TableHead>
            <TableHead>社員名</TableHead>
            <TableHead>部署</TableHead>
            <TableHead>入社年度</TableHead>
            <TableHead
              className="cursor-pointer"
              onClick={() => handleSort("level")}
            >
              <div className="flex items-center">
                レベル
                {renderSortIcon("level")}
              </div>
            </TableHead>
            <TableHead
              className="cursor-pointer"
              onClick={() => handleSort("overall_score")}
            >
              <div className="flex items-center">
                総合スコア
                {renderSortIcon("overall_score")}
              </div>
            </TableHead>
            <TableHead
              className="cursor-pointer"
              onClick={() => handleSort("growth_rate")}
            >
              <div className="flex items-center">
                成長率
                {renderSortIcon("growth_rate")}
              </div>
            </TableHead>
            <TableHead className="w-10"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedTrainees.map((trainee, index) => (
            <React.Fragment key={trainee.id}>
              <TableRow className="hover:bg-gray-50">
                <TableCell>
                  <div className="flex items-center justify-center">
                    {renderRankingMedal(index)}
                  </div>
                </TableCell>
                <TableCell className="font-medium">{trainee.name}</TableCell>
                <TableCell>{trainee.department || "未設定"}</TableCell>
                <TableCell>{trainee.join_year || "未設定"}</TableCell>
                <TableCell>
                  <Badge className={getLevelBadgeColor(trainee.level)}>
                    {trainee.level}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center">
                    <span className="font-medium mr-2">
                      {trainee.overall_score.toFixed(1)}
                    </span>
                    {renderScoreBar(trainee.overall_score)}
                  </div>
                </TableCell>
                <TableCell>
                  <div
                    className={`flex items-center ${
                      trainee.growth_rate >= 0
                        ? "text-green-600"
                        : "text-red-600"
                    }`}
                  >
                    {trainee.growth_rate >= 0 ? (
                      <ChevronUpSquare className="h-4 w-4 mr-1" />
                    ) : (
                      <ChevronDownSquare className="h-4 w-4 mr-1" />
                    )}
                    {trainee.growth_rate.toFixed(1)}%
                  </div>
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleDetails(trainee.id)}
                  >
                    {expandedTrainee === trainee.id ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </Button>
                </TableCell>
              </TableRow>

              {/* 詳細情報 */}
              {expandedTrainee === trainee.id && (
                <TableRow className="bg-gray-50">
                  <TableCell colSpan={8} className="p-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-3">
                        <h4 className="font-medium text-sm text-gray-700">
                          評価詳細
                        </h4>

                        <div className="space-y-2">
                          <div>
                            <div className="flex justify-between text-sm mb-1">
                              <span>コード品質</span>
                              <span>
                                {trainee.code_quality_score.toFixed(1)}
                              </span>
                            </div>
                            {renderScoreBar(trainee.code_quality_score)}
                          </div>

                          <div>
                            <div className="flex justify-between text-sm mb-1">
                              <span>可読性</span>
                              <span>
                                {trainee.readability_score.toFixed(1)}
                              </span>
                            </div>
                            {renderScoreBar(trainee.readability_score)}
                          </div>

                          <div>
                            <div className="flex justify-between text-sm mb-1">
                              <span>効率性</span>
                              <span>{trainee.efficiency_score.toFixed(1)}</span>
                            </div>
                            {renderScoreBar(trainee.efficiency_score)}
                          </div>

                          <div>
                            <div className="flex justify-between text-sm mb-1">
                              <span>ベストプラクティス</span>
                              <span>
                                {trainee.best_practices_score.toFixed(1)}
                              </span>
                            </div>
                            {renderScoreBar(trainee.best_practices_score)}
                          </div>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <h4 className="font-medium text-sm text-gray-700">
                          その他情報
                        </h4>

                        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                          <div className="text-sm text-gray-500">評価回数</div>
                          <div>{trainee.evaluation_count}回</div>

                          <div className="text-sm text-gray-500">
                            最終評価日
                          </div>
                          <div>{trainee.last_evaluation_date || "なし"}</div>

                          <div className="text-sm text-gray-500">
                            平均修正回数
                          </div>
                          <div>
                            {trainee.avg_revision_count?.toFixed(1) || "なし"}
                          </div>

                          <div className="text-sm text-gray-500">
                            最多問題点
                          </div>
                          <div>{trainee.most_common_issue || "データなし"}</div>
                        </div>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </React.Fragment>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
