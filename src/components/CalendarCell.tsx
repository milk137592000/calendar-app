'use client';

import React from 'react';
import { format, isSameDay } from 'date-fns';
import { zhTW } from 'date-fns/locale';
import { TEAMS } from '@/data/teams';
import { getShiftForDate, calculateTeamDeficit, getMemberRole } from '@/utils/schedule';
import type { LeaveRecord } from '@/types/LeaveRecord';
import type { DaySchedule } from '@/types/schedule';

interface CalendarCellProps {
    date: Date;
    shifts: DaySchedule['shifts'];
    selectedTeam?: string;
    isLeaveMode: boolean;
    leaveRecords: LeaveRecord[];
    onToggleLeave?: (date: Date) => void;
    isToday: boolean;
    lunarDate?: string;
}

const CalendarCell: React.FC<CalendarCellProps> = ({
    date,
    shifts,
    selectedTeam,
    isLeaveMode,
    leaveRecords,
    onToggleLeave,
    isToday,
    lunarDate
}) => {
    const formattedDate = format(date, 'yyyy-MM-dd');

    // 獲取當天的請假記錄
    const dayLeaveRecords = leaveRecords.filter(record => record.date === formattedDate);

    // 計算每個班級的差額
    const deficits = Object.keys(TEAMS)
        .filter(team => !selectedTeam || team === selectedTeam) // 只計算選中的班級的差額
        .map(team => {
            const deficit = calculateTeamDeficit(team, date);
            return deficit;
        })
        .filter(Boolean);

    // 檢查是否為週六
    const isSaturday = date.getDay() === 6;

    const handleClick = () => {
        if (onToggleLeave) {
            onToggleLeave(date);
        }
    };

    // 獲取當前選擇班級的班別
    const currentTeamShiftType = selectedTeam ? shifts[selectedTeam as keyof typeof shifts] : undefined;

    // 獲取班別的樣式
    const getShiftStyle = (shiftType: string) => {
        switch (shiftType) {
            case '大休':
            case '小休':
                return 'bg-red-700 text-white';
            case '早班':
                return 'bg-blue-600 text-white';
            case '中班':
                return 'bg-amber-700 text-white';
            case '夜班':
                return 'bg-gray-900 text-white';
            default:
                return 'bg-gray-100 text-gray-600';
        }
    };

    return (
        <div
            className={`
                relative min-h-[70px] p-1 sm:p-2 border border-gray-200 rounded-xl bg-white
                flex flex-col items-center justify-start gap-1 text-center
                ${isToday ? 'border-blue-500' : ''}
                cursor-pointer hover:bg-gray-50
            `}
            onClick={handleClick}
        >
            <div className="text-xs font-bold text-gray-700">{format(date, 'd', { locale: zhTW })}</div>
            {isSaturday && deficits.length > 0 && (
                <div className="text-[10px] bg-orange-100 text-orange-700 rounded-full px-2 py-0.5">{deficits.join('、')}</div>
            )}
            <div className="flex flex-col items-center gap-1 w-full mt-1">
                {!isLeaveMode ? (
                    selectedTeam && currentTeamShiftType ? (
                        <span className={`text-xs px-2 py-0.5 rounded-full ${getShiftStyle(currentTeamShiftType)}`}>{currentTeamShiftType}</span>
                    ) : (
                        Object.entries(shifts).map(([team, type], idx) => (
                            <span key={idx} className={`text-[10px] px-2 py-0.5 rounded-full ${getShiftStyle(type)}`}>{team}: {type}</span>
                        ))
                    )
                ) : (
                    dayLeaveRecords.map((record, idx) => (
                        <span
                            key={idx}
                            className={`text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800 font-medium`}
                        >
                            {record.name} {getMemberRole(record.name) === '班長' ? '(班長)' : ''}
                        </span>
                    ))
                )}
            </div>
        </div>
    );
};

export default CalendarCell; 