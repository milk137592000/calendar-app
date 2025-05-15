'use client';

import React, { useState } from 'react';
import Calendar from '@/components/Calendar';
import { DaySchedule, ShiftType, TEAMS } from '@/types/schedule';
import { format } from 'date-fns';
import { useRouter } from 'next/navigation';
import { TEAM_START_POSITIONS } from '@/utils/schedule';
import type { LeaveRecord } from "@/types/LeaveRecord";

// 模擬農曆日期
const getLunarDate = (date: Date) => {
    const day = date.getDate();
    return `初${day}`; // 這只是示例，實際應該使用真實的農曆轉換
};

// 8天循環的班別順序
const SHIFT_CYCLE: ShiftType[] = [
    '大休',          // 第1天
    '早班', '早班',   // 第2-3天
    '中班', '中班',   // 第4-5天
    '小休',          // 第6天
    '夜班', '夜班'    // 第7-8天
];

// 模擬排班數據生成器
const generateSchedules = (year: number, month: number): DaySchedule[] => {
    const teams = ['A', 'B', 'C', 'D'] as const;
    const schedules: DaySchedule[] = [];

    // 計算2025/04/01到目標日期的天數差
    const startDate = new Date(2025, 3, 1); // 2025/04/01
    const targetMonthStart = new Date(year, month - 1, 1);
    const targetMonthEnd = new Date(year, month, 0);

    for (let date = new Date(targetMonthStart); date <= targetMonthEnd; date = new Date(date.setDate(date.getDate() + 1))) {
        const daysDiff = Math.floor((date.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

        const shifts: { [key: string]: ShiftType } = {};
        teams.forEach(team => {
            const startPos = TEAM_START_POSITIONS[team];
            if (typeof startPos !== 'number') return;
            const cyclePosition = ((startPos + daysDiff) % 8 + 8) % 8;
            shifts[team] = SHIFT_CYCLE[cyclePosition];
        });
        schedules.push({
            date: format(date, 'yyyy-MM-dd'),
            shifts: shifts as { A: ShiftType; B: ShiftType; C: ShiftType; D: ShiftType },
            leaveRecords: [],
            holidays: []
        });
    }

    return schedules;
};

export default function Home() {
    const router = useRouter();
    const [currentDate, setCurrentDate] = useState<Date>(() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return today;
    });
    const [selectedTeam, setSelectedTeam] = useState<string>('請假'); // 預設顯示請假日曆
    const [leaveRecords, setLeaveRecords] = useState<LeaveRecord[]>([]);
    const [userName, setUserName] = useState<string>('');

    // 從 API 獲取請假記錄
    const fetchLeaveRecords = async () => {
        if (!currentDate) return;
        try {
            const year = currentDate.getFullYear();
            const month = currentDate.getMonth() + 1;
            const response = await fetch(`/api/leave?year=${year}&month=${month}`);
            if (!response.ok) throw new Error('Failed to fetch leave records');
            const records = await response.json();
            setLeaveRecords(records);
        } catch (error) {
            console.error('Error fetching leave records:', error);
        }
    };

    // 在組件掛載時和日期變更時獲取請假記錄
    React.useEffect(() => {
        fetchLeaveRecords();
    }, [currentDate]);

    const schedules = currentDate ? generateSchedules(
        currentDate.getFullYear(),
        currentDate.getMonth() + 1
    ) : [];

    const handleToggleLeave = (date: Date) => {
        if (selectedTeam === '請假') {
            const dateStr = format(date, 'yyyy-MM-dd');
            router.push(`/leave/${dateStr}`);
        }
    };

    // 生成下拉選單選項
    const selectOptions = [
        { value: '請假', label: '請假' },
        ...Object.keys(TEAMS).map(team => ({
            value: team,
            label: `${team}班`
        })),
        { value: '', label: '所有班別' }
    ];

    // 獲取人員角色
    const getMemberRole = (memberName: string) => {
        for (const teamData of Object.values(TEAMS)) {
            const member = teamData.members.find(m => m.name === memberName);
            if (member) return member.role;
        }
        return null;
    };

    // 獲取請假記錄的背景顏色
    const getLeaveRecordColor = (record: LeaveRecord) => {
        if (!record.fullDayOvertime && !record.customOvertime) {
            const role = getMemberRole(record.name);
            return role === '班長' ? 'bg-red-50' : 'bg-blue-50';
        }
        // 你可以根據 fullDayOvertime 或 customOvertime 的確認狀態進一步自訂顏色
        const role = getMemberRole(record.name);
        return role === '班長' ? 'bg-red-50' : 'bg-blue-50';
    };

    return (
        <main className="min-h-screen bg-gray-100">
            <div className="container mx-auto py-8 px-4">
                <h1 className="text-2xl font-bold text-gray-800 mb-2 w-full text-center pl-4">
                    四輕丁二烯
                </h1>
                <div className="mb-4 flex justify-center items-center">
                    <div className="relative">
                        <select
                            value={selectedTeam}
                            onChange={(e) => setSelectedTeam(e.target.value)}
                            className="block w-48 px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        >
                            {selectOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                    {option.label}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
                <Calendar
                    schedules={schedules}
                    currentDate={currentDate || new Date()}
                    onMonthChange={setCurrentDate}
                    selectedTeam={selectedTeam === '請假' ? undefined : selectedTeam}
                    isLeaveMode={selectedTeam === '請假'}
                    leaveRecords={leaveRecords}
                    onToggleLeave={handleToggleLeave}
                    getLeaveRecordColor={getLeaveRecordColor}
                />
            </div>
        </main>
    );
} 