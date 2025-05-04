'use client';

import React from 'react';
import { format, isSameDay } from 'date-fns';
import { zhTW } from 'date-fns/locale';
import { TEAMS } from '@/data/teams';
import { getShiftForDate, calculateTeamDeficit, getMemberRole, getMemberTeam } from '@/utils/schedule';
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
        .filter(team => !selectedTeam || team === selectedTeam)
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

    // 獲取當天的大休班級
    const getBigRestTeam = () => {
        for (const [team, shift] of Object.entries(shifts)) {
            if (shift === '大休') {
                return team;
            }
        }
        return null;
    };

    // 獲取建議加班班級
    const getSuggestedOvertimeTeams = (record: LeaveRecord) => {
        const suggestions = new Set<string>();
        const leaveTeam = getMemberTeam(record.name);
        const leaveShift = leaveTeam ? shifts[leaveTeam as keyof typeof shifts] : null;

        // 如果是全天請假
        if (record.period === 'fullDay') {
            // 如果已經有加班人員，不顯示建議
            if (record.fullDayOvertime?.type === '加整班' && record.fullDayOvertime.fullDayMember?.confirmed) {
                return [];
            }
            if (record.fullDayOvertime?.type === '加一半' && 
                record.fullDayOvertime.firstHalfMember?.confirmed && 
                record.fullDayOvertime.secondHalfMember?.confirmed) {
                return [];
            }

            // 獲取建議班級
            const bigRestTeam = getBigRestTeam();
            if (bigRestTeam) {
                suggestions.add(bigRestTeam);
            }
        } 
        // 如果是自定義時段請假
        else if (typeof record.period === 'object' && record.period.type === 'custom') {
            const startTime = record.period.startTime;
            const endTime = record.period.endTime;
            const leaveTeam = getMemberTeam(record.name);
            const leaveShift = leaveTeam ? shifts[leaveTeam as keyof typeof shifts] : null;

            // 檢查是否與上一班結束時間重疊
            if (leaveShift === '中班' && startTime === '1615') {
                const prevTeam = Object.entries(shifts).find(([_, shift]) => shift === '早班')?.[0];
                if (prevTeam) suggestions.add(prevTeam);
            }
            if (leaveShift === '夜班' && startTime === '2315') {
                const prevTeam = Object.entries(shifts).find(([_, shift]) => shift === '中班')?.[0];
                if (prevTeam) suggestions.add(prevTeam);
            }

            // 檢查是否與下一班開始時間重疊
            if (leaveShift === '早班' && endTime === '1615') {
                const nextTeam = Object.entries(shifts).find(([_, shift]) => shift === '中班')?.[0];
                if (nextTeam) suggestions.add(nextTeam);
            }
            if (leaveShift === '中班' && endTime === '2315') {
                const nextTeam = Object.entries(shifts).find(([_, shift]) => shift === '夜班')?.[0];
                if (nextTeam) suggestions.add(nextTeam);
            }
        }

        return Array.from(suggestions);
    };

    // 判斷是否應該顯示請假記錄
    const shouldShowLeaveRecord = (record: LeaveRecord) => {
        // 如果當前班級是大休，顯示所有未找齊加班人員的請假記錄
        if (selectedTeam && shifts[selectedTeam as keyof typeof shifts] === '大休') {
            const isOvertimeComplete = record.fullDayOvertime?.type === '加整班'
                ? record.fullDayOvertime.fullDayMember?.confirmed
                : record.fullDayOvertime?.type === '加一半' &&
                  record.fullDayOvertime.firstHalfMember?.confirmed &&
                  record.fullDayOvertime.secondHalfMember?.confirmed;
            const hasConfirmedCustomOvertime = record.customOvertime?.confirmed;
            return !isOvertimeComplete && !hasConfirmedCustomOvertime;
        }

        // 如果當前班級在建議加班班級列表中，顯示請假記錄
        if (selectedTeam) {
            const suggestedTeams = getSuggestedOvertimeTeams(record);
            return suggestedTeams.includes(selectedTeam);
        }

        return false;
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
                            <div className={`block w-full text-xs px-0 py-0.5 text-center ${getShiftStyle(currentTeamShiftType)}`}>{currentTeamShiftType}</div>
                        )
                    ) : (
                        <div className="flex flex-row flex-wrap justify-center items-center gap-1 w-full mt-1">
                            {Object.entries(shifts).map(([team, type], index) => (
                                <span key={index} className={`inline-block text-[9px] px-1 py-0.5 whitespace-nowrap text-center ${getShiftStyle(type)}`}>{team}: {type}</span>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* 顯示請假記錄 */}
            {isLeaveMode && dayLeaveRecords.length > 0 && (
                <div className="flex flex-col justify-center items-center gap-1 w-full mt-1">
                    {dayLeaveRecords.map((record, idx) => {
                        // 判斷是否應該顯示這條請假記錄
                        if (!shouldShowLeaveRecord(record)) {
                            return null;
                        }

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
                        
                        // 根據請假人數調整字體大小
                        const fontSizeClass = dayLeaveRecords.length > 4 
                            ? 'text-[7px]' 
                            : 'text-[9px]';

                        return (
                            <div
                                key={idx}
                                className={`${tagClass} ${fontSizeClass} px-1 py-0.5 rounded whitespace-nowrap`}
                            >
                                {record.name}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default CalendarCell; 