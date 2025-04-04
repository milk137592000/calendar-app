'use client';

import React, { useState } from 'react';
import Calendar from '@/components/Calendar';
import { DaySchedule, ShiftType, LeaveRecord, TEAMS } from '@/types/schedule';
import { format } from 'date-fns';
import { useRouter } from 'next/navigation';

// 模擬農曆日期
const getLunarDate = (date: Date) => {
    const day = date.getDate();
    return `初${day}`; // 這只是示例，實際應該使用真實的農曆轉換
};

// 8天循環的班別順序
const SHIFT_CYCLE: ShiftType[] = [
    '早班', '早班',   // 早班連續2天
    '中班', '中班',   // 中班連續2天
    '小休',          // 小休1天
    '夜班', '夜班',   // 夜班連續2天
    '大休'           // 大休1天
];

// 計算2025/04/01每個班別在循環中的位置
const TEAM_START_POSITIONS: Record<string, number> = {
    'A': 8,  // 大休是第8天
    'B': 2,  // 早班(第2天)是第2天
    'C': 4,  // 中班(第2天)是第4天
    'D': 6   // 夜班(第1天)是第6天
};

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
        
        const shifts = teams.map(team => {
            const startPos = TEAM_START_POSITIONS[team];
            const cyclePosition = ((startPos - 1 + daysDiff) % 8 + 8) % 8; // 確保結果為正數
            return {
                team: team as 'A' | 'B' | 'C' | 'D',
                type: SHIFT_CYCLE[cyclePosition],
                date: new Date(date)
            };
        });
        
        schedules.push({
            date: new Date(date),
            shifts,
            lunarDate: getLunarDate(date)
        });
    }
    
    return schedules;
};

export default function Home() {
    const router = useRouter();
    const [currentDate, setCurrentDate] = useState(new Date(2025, 3, 1)); // 預設顯示2025年4月
    const [selectedTeam, setSelectedTeam] = useState<string>('請假'); // 預設顯示請假日曆
    const [leaveRecords, setLeaveRecords] = useState<LeaveRecord[]>([]);
    const [userName, setUserName] = useState<string>('');

    // 從 API 獲取請假記錄
    const fetchLeaveRecords = async () => {
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

    const schedules = generateSchedules(
        currentDate.getFullYear(),
        currentDate.getMonth() + 1
    );

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
        if (!record.overtime) {
            const role = getMemberRole(record.name);
            return role === '班長' ? 'bg-red-50' : 'bg-blue-50';
        }

        // 檢查加班確認狀態
        let isAllConfirmed = false;
        
        if (record.overtime.type === 'bigRest') {
            // 加整班：需要 confirmed 和 firstConfirmed 都為 true
            isAllConfirmed = Boolean(record.overtime.confirmed) && Boolean(record.overtime.firstConfirmed);
        } else {
            // 加一半：只要兩位加班人員都確認即可，不分順序
            const firstConfirmed = Boolean(record.overtime.firstConfirmed);
            const secondConfirmed = Boolean(record.overtime.secondMember?.confirmed);
            isAllConfirmed = firstConfirmed && secondConfirmed;
        }
        
        if (isAllConfirmed) {
            return 'bg-gray-100'; // 所有加班人員都已確認時顯示為淺灰色
        }
        
        const role = getMemberRole(record.name);
        return role === '班長' ? 'bg-red-50' : 'bg-blue-50';
    };

    return (
        <main className="min-h-screen bg-gray-100">
            <div className="container mx-auto py-8 px-4">
                <h1 className="text-2xl font-bold text-gray-800 mb-4 w-full text-center pl-4">
                    四輕丁二烯
                </h1>
                <div className="mb-8 flex flex-col sm:flex-row justify-end items-center gap-4">
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
                    currentDate={currentDate}
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