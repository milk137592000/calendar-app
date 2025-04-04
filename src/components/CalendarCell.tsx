'use client';

import React from 'react';
import { ShiftEntry, SHIFT_STYLES, LeaveRecord, TEAMS, ShiftType } from '@/types/schedule';
import { format } from 'date-fns';

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

interface CalendarCellProps {
    date: Date;
    shifts: ShiftEntry[];
    isToday?: boolean;
    lunarDate?: string;
    selectedTeam?: string;
    isLeaveMode?: boolean;
    leaveRecords?: LeaveRecord[];
    onToggleLeave?: (date: Date) => void;
}

export default function CalendarCell({ 
    date, 
    shifts, 
    isToday = false, 
    lunarDate, 
    selectedTeam,
    isLeaveMode = false,
    leaveRecords = [],
    onToggleLeave
}: CalendarCellProps) {
    const formattedDate = format(date, 'yyyy-MM-dd');
    const dayLeaveRecords = leaveRecords.filter(record => record.date === formattedDate);

    const filteredShifts = selectedTeam 
        ? shifts.filter(shift => shift.team === selectedTeam)
        : shifts;

    const handleClick = () => {
        if (isLeaveMode && onToggleLeave) {
            onToggleLeave(date);
        }
    };

    // 獲取指定日期的請假記錄
    const getLeaveRecords = (date: string) => {
        return leaveRecords.filter(record => record.date === date);
    };

    // 獲取人員所屬班級
    const getMemberTeam = (memberName: string) => {
        for (const [team, teamData] of Object.entries(TEAMS)) {
            if (teamData.members.some(member => member.name === memberName)) {
                return team;
            }
        }
        return null;
    };

    // 獲取人員角色
    const getMemberRole = (memberName: string) => {
        for (const teamData of Object.values(TEAMS)) {
            const member = teamData.members.find(m => m.name === memberName);
            if (member) return member.role;
        }
        return null;
    };

    // 獲取班級當天班別
    const getTeamShift = (team: string) => {
        const startDate = new Date(2025, 3, 1); // 2025/04/01
        const targetDate = new Date(date);
        const daysDiff = Math.floor((targetDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
        
        const startPos = TEAM_START_POSITIONS[team];
        const cyclePosition = ((startPos - 1 + daysDiff) % 8 + 8) % 8;
        return SHIFT_CYCLE[cyclePosition];
    };

    return (
        <div 
            className={`border border-gray-200 min-h-[100px] ${isToday ? 'bg-blue-50' : 'bg-white'}
                ${isLeaveMode ? 'cursor-pointer hover:bg-gray-50' : ''}`}
            onClick={handleClick}
        >
            <div className="flex justify-between items-start p-1 border-b border-gray-200">
                <div className="text-base">
                    {format(date, 'd')}
                </div>
                {lunarDate && (
                    <div className="text-xs text-gray-500">
                        {lunarDate}
                    </div>
                )}
            </div>
            <div className="p-1 space-y-0.5">
                {isLeaveMode ? (
                    <div className="flex-1 flex flex-col gap-1">
                        {getLeaveRecords(formattedDate).map((record, index) => {
                            const team = getMemberTeam(record.name);
                            const role = getMemberRole(record.name);
                            const shift = team ? getTeamShift(team) : '';
                            const bgColor = record.overtime?.confirmed ? 'bg-gray-100' : (role === '班長' ? 'bg-red-50' : 'bg-blue-50');
                            const textColor = record.overtime?.confirmed ? 'text-gray-600' : (role === '班長' ? 'text-red-700' : 'text-blue-700');
                            
                            return (
                                <div
                                    key={index}
                                    className={`text-xs p-1 rounded ${bgColor} ${textColor}`}
                                >
                                    {record.name} ({team} {shift})
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    filteredShifts.map((shift, index) => (
                        <div
                            key={index}
                            className="text-xs py-0.5 px-1.5 rounded flex items-center justify-between"
                            style={{
                                backgroundColor: SHIFT_STYLES[shift.type].backgroundColor,
                                color: SHIFT_STYLES[shift.type].textColor,
                            }}
                        >
                            <span>{shift.team}</span>
                            <span>{shift.type}</span>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
} 