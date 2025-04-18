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
    const currentTeamShift = shifts.find(shift => shift.team === selectedTeam);

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
                    <span className="text-yellow-700">{deficits.join('、')}</span>
                )}
            </div>

            {/* 顯示班別 */}
            {!isLeaveMode && (
                <div className="mt-2">
                    {selectedTeam ? (
                        currentTeamShift && (
                            <div className={`text-sm px-2 py-1 rounded ${getShiftStyle(currentTeamShift.type)}`}>
                                {currentTeamShift.type}
                            </div>
                        )
                    ) : (
                        <div className="space-y-1">
                            {shifts.map((shift, index) => (
                                <div key={index} className={`text-xs px-2 py-1 rounded ${getShiftStyle(shift.type)}`}>
                                    {shift.team}: {shift.type}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* 顯示請假記錄 */}
            {isLeaveMode && dayLeaveRecords.length > 0 && (
                <div className="mt-2 space-y-1">
                    {dayLeaveRecords.map((record, index) => {
                        const team = Object.entries(TEAMS).find(([_, teamData]) =>
                            teamData.members.some(member => member.name === record.name)
                        )?.[0];

                        const shift = team ? getShiftForDate(team, formattedDate) : null;

                        // Check for different overtime types
                        const isOvertimeComplete = record.fullDayOvertime?.type === '加整班'
                            ? record.fullDayOvertime.fullDayMember?.confirmed
                            : record.fullDayOvertime?.type === '加一半' &&
                            record.fullDayOvertime.firstHalfMember?.confirmed &&
                            record.fullDayOvertime.secondHalfMember?.confirmed;

                        // Check for custom overtime confirmation
                        const hasConfirmedCustomOvertime = record.customOvertime?.confirmed;

                        return (
                            <div
                                key={index}
                                className={`text-xs p-1 rounded ${hasConfirmedCustomOvertime || isOvertimeComplete
                                        ? 'bg-gray-200 text-gray-700' // Light gray background for any confirmed overtime
                                        : getMemberRole(record.name) === '班長'
                                            ? 'bg-red-100 text-gray-700'
                                            : 'bg-blue-100 text-gray-700'
                                    }`}
                            >
                                <div className="flex items-center space-x-1">
                                    <span className="font-bold">{record.name}</span>
                                    {team && <span>{team}</span>}
                                    {shift && <span>{shift.replace('班', '')}</span>}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default CalendarCell; 