// frontend/src/components/analytics/GrowthTrendChart.tsx
"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  ComposedChart,
  Bar,
} from "recharts";

interface GrowthTrendChartProps {
  data: Array<{
    period: string;
    averageLevel: number;
    growthRate: number;
  }>;
}

export function GrowthTrendChart({ data }: GrowthTrendChartProps) {
  // レベルの最大値と最小値を計算
  const maxLevel = Math.max(...data.map((item) => item.averageLevel), 5);
  const minLevel = Math.min(...data.map((item) => item.averageLevel), 0);

  // 成長率の最大値と最小値を計算
  const growthRates = data.map((item) => item.growthRate);
  const maxGrowthRate = Math.max(...growthRates, 20);
  const minGrowthRate = Math.min(...growthRates, -5);

  // レベルのドメイン（上限と下限）を設定
  const levelDomain = [
    Math.max(0, Math.floor(minLevel) - 0.5),
    Math.min(5, Math.ceil(maxLevel) + 0.5),
  ];

  // 成長率のドメインを設定
  const growthRateDomain = [
    Math.floor(minGrowthRate) - 2,
    Math.ceil(maxGrowthRate) + 2,
  ];

  // A-Eのレベルに対応する数値
  const levelMapping = {
    5: "A",
    4: "B",
    3: "C",
    2: "D",
    1: "E",
  };

  // YAxisのティックフォーマッター
  const formatYAxisTick = (value: number) => {
    if (value >= 0.5 && value <= 5.5 && Number.isInteger(value)) {
      return (
        levelMapping[value as keyof typeof levelMapping] || value.toString()
      );
    }
    return value.toFixed(1);
  };

  // カスタムツールチップ
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const levelValue = payload[0].value;
      const growthRateValue = payload[1]?.value;

      // レベルの対応する文字を取得
      let levelLetter = "";
      if (levelValue >= 4.5) levelLetter = "A";
      else if (levelValue >= 3.5) levelLetter = "B";
      else if (levelValue >= 2.5) levelLetter = "C";
      else if (levelValue >= 1.5) levelLetter = "D";
      else levelLetter = "E";

      return (
        <div className="custom-tooltip bg-white p-3 border rounded shadow">
          <p className="font-medium">{`${label}`}</p>
          <p className="text-blue-600">{`平均レベル: ${levelValue.toFixed(
            2
          )} (${levelLetter})`}</p>
          {growthRateValue !== undefined && (
            <p
              className={
                growthRateValue >= 0 ? "text-green-600" : "text-red-600"
              }
            >
              {`成長率: ${growthRateValue.toFixed(2)}%`}
            </p>
          )}
        </div>
      );
    }

    return null;
  };

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart
        data={data}
        margin={{
          top: 20,
          right: 30,
          left: 0,
          bottom: 10,
        }}
      >
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="period" />

        {/* 平均レベルのY軸 (左) */}
        <YAxis
          yAxisId="level"
          domain={levelDomain}
          tickFormatter={formatYAxisTick}
          ticks={[1, 2, 3, 4, 5]}
        />

        {/* 成長率のY軸 (右) */}
        <YAxis
          yAxisId="growth"
          orientation="right"
          domain={growthRateDomain}
          tickFormatter={(value) => `${value}%`}
        />

        <Tooltip content={<CustomTooltip />} />
        <Legend />

        {/* レベルの区切り線 */}
        <ReferenceLine
          yAxisId="level"
          y={4.5}
          stroke="#4CAF50"
          strokeDasharray="3 3"
        />
        <ReferenceLine
          yAxisId="level"
          y={3.5}
          stroke="#2196F3"
          strokeDasharray="3 3"
        />
        <ReferenceLine
          yAxisId="level"
          y={2.5}
          stroke="#FFC107"
          strokeDasharray="3 3"
        />
        <ReferenceLine
          yAxisId="level"
          y={1.5}
          stroke="#FF9800"
          strokeDasharray="3 3"
        />

        {/* 成長率0の基準線 */}
        <ReferenceLine
          yAxisId="growth"
          y={0}
          stroke="#666"
          strokeDasharray="3 3"
        />

        {/* 平均レベル (折れ線) */}
        <Line
          yAxisId="level"
          type="monotone"
          dataKey="averageLevel"
          name="平均レベル"
          stroke="#0066CC"
          strokeWidth={2}
          dot={{ r: 5 }}
          activeDot={{ r: 8 }}
        />

        {/* 成長率 (棒グラフ) */}
        <Bar
          yAxisId="growth"
          dataKey="growthRate"
          name="成長率"
          fill="#82ca9d"
          radius={[4, 4, 0, 0]}
          barSize={20}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
