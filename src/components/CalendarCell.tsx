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
            className={`relative p-2 h-32 border border-gray-200 ${isToday ? 'border-blue-500' : ''
                } cursor-pointer hover:bg-gray-50`}
            onClick={handleClick}
        >
            <div className="text-sm font-medium flex justify-between items-center">
                <span>{format(date, 'd', { locale: zhTW })}</span>
                {isSaturday && deficits.length > 0 && (
                    <div className="text-[9px] bg-amber-800 text-white rounded-full px-2 py-0.5 whitespace-nowrap">
                        {deficits.map(d => d && d.replace('差額', '差')).join('、')}
                    </div>
                )}
            </div>

            {/* 顯示班別 */}
            {!isLeaveMode && (
                <div className="mt-2">
                    {selectedTeam ? (
                        currentTeamShiftType && (
                            <div className={`text-sm px-2 py-1 rounded ${getShiftStyle(currentTeamShiftType)}`}>{currentTeamShiftType}</div>
                        )
                    ) : (
                        <div className="space-y-1">
                            {Object.entries(shifts).map(([team, type], index) => (
                                <div key={index} className={`text-xs px-2 py-1 rounded ${getShiftStyle(type)}`}>{team}: {type}</div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* 顯示請假記錄 */}
            {isLeaveMode && dayLeaveRecords.length > 0 && (
                <div className="flex flex-col justify-center items-center gap-1 w-full mt-1">
                    {dayLeaveRecords.map((record, idx) => {
                        // 判斷加班是否已確認
                        const isOvertimeComplete = record.fullDayOvertime?.type === '加整班'
                            ? record.fullDayOvertime.fullDayMember?.confirmed
                            : record.fullDayOvertime?.type === '加一半' &&
                              record.fullDayOvertime.firstHalfMember?.confirmed &&
                              record.fullDayOvertime.secondHalfMember?.confirmed;
                        const hasConfirmedCustomOvertime = record.customOvertime?.confirmed;
                        const isConfirmed = isOvertimeComplete || hasConfirmedCustomOvertime;
                        // 判斷班長/班員顏色
                        const role = getMemberRole(record.name);
                        let tagClass = '';
                        if (isConfirmed) {
                            tagClass = 'bg-gray-200 text-gray-500';
                        } else if (role === '班長') {
                            tagClass = 'bg-red-100 text-red-700';
                        } else {
                            tagClass = 'bg-blue-100 text-blue-700';
                        }
                        // 找出 team
                        const team = Object.entries(TEAMS).find(([_, teamData]) =>
                            teamData.members.some(member => member.name === record.name)
                        )?.[0] || '';
                        return (
                            <span
                                key={idx}
                                className={`text-[9px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${tagClass}`}
                            >
                                {record.name}<span className="text-[8px] align-middle">{team}</span>
                            </span>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default CalendarCell; 