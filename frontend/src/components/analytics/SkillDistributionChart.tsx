// frontend/src/components/analytics/SkillDistributionChart.tsx
"use client";

import { Card } from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from "recharts";

interface SkillDistributionChartProps {
  data: Array<{
    level: string;
    count: number;
  }>;
}

export function SkillDistributionChart({ data }: SkillDistributionChartProps) {
  // レベルごとの色を設定
  const levelColors = {
    A: "#4CAF50", // 緑
    B: "#2196F3", // 青
    C: "#FFC107", // 黄
    D: "#FF9800", // オレンジ
    E: "#F44336", // 赤
  };

  // 総数を計算
  const total = data.reduce((sum, item) => sum + item.count, 0);

  // データを加工して割合を追加
  const chartData = data.map((item) => ({
    ...item,
    percentage: total > 0 ? ((item.count / total) * 100).toFixed(1) : "0.0",
  }));

  // A-Eの順に並べる
  const sortedData = [...chartData].sort((a, b) => {
    const order = { A: 0, B: 1, C: 2, D: 3, E: 4 };
    return (
      (order[a.level as keyof typeof order] || 0) -
      (order[b.level as keyof typeof order] || 0)
    );
  });

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={sortedData}
        margin={{
          top: 20,
          right: 30,
          left: 0,
          bottom: 10,
        }}
      >
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="level" />
        <YAxis yAxisId="left" orientation="left" />
        <YAxis
          yAxisId="right"
          orientation="right"
          tickFormatter={(value) => `${value}%`}
        />
        <Tooltip
          formatter={(value, name, props) => {
            if (name === "count") return [`${value}人`, "人数"];
            if (name === "percentage") return [`${value}%`, "割合"];
            return [value, name];
          }}
          labelFormatter={(label) => `レベル ${label}`}
        />
        <Legend />
        <Bar yAxisId="left" dataKey="count" name="人数" radius={[4, 4, 0, 0]}>
          {sortedData.map((entry, index) => (
            <Cell
              key={`cell-${index}`}
              fill={
                levelColors[entry.level as keyof typeof levelColors] || "#000"
              }
            />
          ))}
        </Bar>
        <Bar
          yAxisId="right"
          dataKey="percentage"
          name="割合"
          fill="#8884d8"
          radius={[4, 4, 0, 0]}
          hide
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
