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

    // 取得目前缺班級（根據請假單 overtime 狀態）
    const getDeficitTeams = (record: LeaveRecord) => {
        const teams: string[] = [];
        // 全天請假
        if (record.period === 'fullDay' && record.fullDayOvertime) {
            if (record.fullDayOvertime.type === '加整班') {
                if (!record.fullDayOvertime.fullDayMember?.confirmed && record.fullDayOvertime.fullDayMember?.team) {
                    teams.push(record.fullDayOvertime.fullDayMember.team);
                }
            } else if (record.fullDayOvertime.type === '加一半') {
                if (!record.fullDayOvertime.firstHalfMember?.confirmed && record.fullDayOvertime.firstHalfMember?.team) {
                    teams.push(record.fullDayOvertime.firstHalfMember.team);
                }
                if (!record.fullDayOvertime.secondHalfMember?.confirmed && record.fullDayOvertime.secondHalfMember?.team) {
                    teams.push(record.fullDayOvertime.secondHalfMember.team);
                }
            }
        }
        // 自定義時段請假
        if (typeof record.period === 'object' && record.period.type === 'custom' && record.customOvertime) {
            if (!record.customOvertime.confirmed && record.customOvertime.team) {
                teams.push(record.customOvertime.team);
            }
        }
        return teams;
    };

    // 判斷是否應該顯示請假記錄
    const shouldShowLeaveRecord = (record: LeaveRecord) => {
        // 請假模式下，所有班級都顯示請假資訊
        if (isLeaveMode) return true;
        // 其他情境維持原本邏輯 + 若本班目前缺人則顯示
        if (selectedTeam) {
            // 若本班是缺班級，且該段尚未被加班填補，則顯示
            const deficitTeams = getDeficitTeams(record);
            if (deficitTeams.includes(selectedTeam)) return true;
            // 原本的建議加班班級顯示
            const suggestedTeams = getSuggestedOvertimeTeams(record);
            return suggestedTeams.includes(selectedTeam);
        }
        // 大休班級維持原本邏輯
        if (selectedTeam && shifts[selectedTeam as keyof typeof shifts] === '大休') {
            const isOvertimeComplete = record.fullDayOvertime?.type === '加整班'
                ? record.fullDayOvertime.fullDayMember?.confirmed
                : record.fullDayOvertime?.type === '加一半' &&
                  record.fullDayOvertime.firstHalfMember?.confirmed &&
                  record.fullDayOvertime.secondHalfMember?.confirmed;
            const hasConfirmedCustomOvertime = record.customOvertime?.confirmed;
            return !isOvertimeComplete && !hasConfirmedCustomOvertime;
        }
        return false;
    };

    // 判斷是否為建議加班班級
    const isSuggestedOvertime = (record: LeaveRecord) => {
        if (!selectedTeam) return false;
        const suggestedTeams = getSuggestedOvertimeTeams(record);
        // 若已經有加班人員確認則不顯示標註
        const isOvertimeComplete = record.fullDayOvertime?.type === '加整班'
            ? record.fullDayOvertime.fullDayMember?.confirmed
            : record.fullDayOvertime?.type === '加一半' &&
              record.fullDayOvertime.firstHalfMember?.confirmed &&
              record.fullDayOvertime.secondHalfMember?.confirmed;
        const hasConfirmedCustomOvertime = record.customOvertime?.confirmed;
        if (isOvertimeComplete || hasConfirmedCustomOvertime) return false;
        return suggestedTeams.includes(selectedTeam);
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
                            <div className="flex flex-row justify-center items-center gap-1 w-full mt-1">
                                <span className={`inline-block text-[9px] px-1 py-0.5 whitespace-nowrap text-center ${getShiftStyle(currentTeamShiftType)}`}>{currentTeamShiftType}</span>
                            </div>
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
                        if (!shouldShowLeaveRecord(record)) {
                            return null;
                        }
                        const isOvertimeComplete = record.fullDayOvertime?.type === '加整班'
                            ? record.fullDayOvertime.fullDayMember?.confirmed
                            : record.fullDayOvertime?.type === '加一半' &&
                              record.fullDayOvertime.firstHalfMember?.confirmed &&
                              record.fullDayOvertime.secondHalfMember?.confirmed;
                        const hasConfirmedCustomOvertime = record.customOvertime?.confirmed;
                        const isConfirmed = isOvertimeComplete || hasConfirmedCustomOvertime;
                        const role = getMemberRole(record.name);
                        let tagClass = '';
                        if (isConfirmed) {
                            tagClass = 'bg-gray-200 text-gray-500';
                        } else if (role === '班長') {
                            tagClass = 'bg-red-100 text-red-700';
                        } else {
                            tagClass = 'bg-blue-100 text-blue-700';
                        }
                        const fontSizeClass = dayLeaveRecords.length > 4 
                            ? 'text-[7px]' 
                            : 'text-[9px]';
                        return (
                            <div
                                key={idx}
                                className={`flex items-center gap-1 ${tagClass} ${fontSizeClass} px-1 py-0.5 rounded whitespace-nowrap`}
                            >
                                {record.name}
                                {/* 若為建議加班班級，顯示標註 */}
                                {isSuggestedOvertime(record) && (
                                    <span className="ml-1 px-1 py-0.5 bg-yellow-200 text-yellow-800 rounded text-[8px]">可加班</span>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default CalendarCell; 