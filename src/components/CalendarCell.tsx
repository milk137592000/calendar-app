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
            // 檢查加班狀態
            if (record.fullDayOvertime?.type === '加整班') {
                // 如果已確認加班，不顯示建議
                if (record.fullDayOvertime.fullDayMember?.confirmed) {
                    return [];
                }
                // 獲取大休班級作為建議
                const bigRestTeam = getBigRestTeam();
                if (bigRestTeam) {
                    suggestions.add(bigRestTeam);
                }
            } else if (record.fullDayOvertime?.type === '加一半') {
                // 檢查前半段加班
                if (!record.fullDayOvertime.firstHalfMember?.confirmed) {
                    // 前半段尚未確認，添加前半段建議班級
                    if (leaveShift === '早班') {
                        // 早班請假，建議中班加前半
                        const midShiftTeam = Object.entries(shifts).find(([_, shift]) => shift === '中班')?.[0];
                        if (midShiftTeam) suggestions.add(midShiftTeam);
                    } else if (leaveShift === '中班') {
                        // 中班請假，建議早班加前半
                        const earlyShiftTeam = Object.entries(shifts).find(([_, shift]) => shift === '早班')?.[0];
                        if (earlyShiftTeam) suggestions.add(earlyShiftTeam);
                    } else if (leaveShift === '夜班') {
                        // 夜班請假，建議中班加前半
                        const midShiftTeam = Object.entries(shifts).find(([_, shift]) => shift === '中班')?.[0];
                        if (midShiftTeam) suggestions.add(midShiftTeam);
                    }
                }
                
                // 檢查後半段加班
                if (!record.fullDayOvertime.secondHalfMember?.confirmed) {
                    // 後半段尚未確認，添加後半段建議班級
                    if (leaveShift === '早班') {
                        // 早班請假，建議小休或夜班加後半
                        const smallRestTeam = Object.entries(shifts).find(([_, shift]) => shift === '小休')?.[0];
                        const nightShiftTeam = Object.entries(shifts).find(([_, shift]) => shift === '夜班')?.[0];
                        if (smallRestTeam) suggestions.add(smallRestTeam);
                        if (nightShiftTeam) suggestions.add(nightShiftTeam);
                    } else if (leaveShift === '中班') {
                        // 中班請假，建議小休或夜班加後半
                        const smallRestTeam = Object.entries(shifts).find(([_, shift]) => shift === '小休')?.[0];
                        const nightShiftTeam = Object.entries(shifts).find(([_, shift]) => shift === '夜班')?.[0];
                        if (smallRestTeam) suggestions.add(smallRestTeam);
                        if (nightShiftTeam) suggestions.add(nightShiftTeam);
                    } else if (leaveShift === '夜班') {
                        // 夜班請假，建議早班加後半
                        const earlyShiftTeam = Object.entries(shifts).find(([_, shift]) => shift === '早班')?.[0];
                        if (earlyShiftTeam) suggestions.add(earlyShiftTeam);
                    }
                }
            } else {
                // 沒有選擇加班類型，但仍需顯示建議
                const bigRestTeam = getBigRestTeam();
                if (bigRestTeam) {
                    suggestions.add(bigRestTeam);
                }
            }
        } 
        // 如果是自定義時段請假
        else if (typeof record.period === 'object' && record.period.type === 'custom') {
            // 如果已確認加班，不顯示建議
            if (record.customOvertime?.confirmed) {
                return [];
            }
            
            const startTime = record.period.startTime;
            const endTime = record.period.endTime;

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
        // 請假模式下，所有班級都顯示請假資訊
        if (isLeaveMode) return true;
        
        // 檢查加班是否已完成
        const isFullDayOvertimeComplete = record.fullDayOvertime?.type === '加整班'
            ? record.fullDayOvertime.fullDayMember?.confirmed
            : record.fullDayOvertime?.type === '加一半' &&
              record.fullDayOvertime.firstHalfMember?.confirmed &&
              record.fullDayOvertime.secondHalfMember?.confirmed;
        const hasConfirmedCustomOvertime = record.customOvertime?.confirmed;
        const isOvertimeComplete = isFullDayOvertimeComplete || hasConfirmedCustomOvertime;
        
        // 如果所有加班位置已填滿，則不顯示在任何班級的日曆上
        if (isOvertimeComplete) return false;
        
        // 大休班級：顯示所有未完成加班的請假記錄
        if (selectedTeam && shifts[selectedTeam as keyof typeof shifts] === '大休') {
            return true;
        }
        
        // 其他班級：只有當該班級是建議加班班級時才顯示
        if (selectedTeam) {
            const suggestedTeams = getSuggestedOvertimeTeams(record);
            return suggestedTeams.includes(selectedTeam);
        }
        
        return false;
    };

    // 判斷是否為建議加班班級
    const isSuggestedOvertime = (record: LeaveRecord) => {
        if (!selectedTeam) return false;
        
        // 檢查是否已經有加班人員確認
        const isFullDayOvertimeComplete = record.fullDayOvertime?.type === '加整班'
            ? record.fullDayOvertime.fullDayMember?.confirmed
            : record.fullDayOvertime?.type === '加一半' &&
              record.fullDayOvertime.firstHalfMember?.confirmed &&
              record.fullDayOvertime.secondHalfMember?.confirmed;
        const hasConfirmedCustomOvertime = record.customOvertime?.confirmed;
        
        // 如果加班已完成，不顯示標註
        if (isFullDayOvertimeComplete || hasConfirmedCustomOvertime) return false;
        
        // 獲取建議加班班級並檢查當前班級是否包含在內
        const suggestedTeams = getSuggestedOvertimeTeams(record);
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
                        
                        // 檢查加班是否已完成
                        const isFullDayOvertimeComplete = record.fullDayOvertime?.type === '加整班'
                            ? record.fullDayOvertime.fullDayMember?.confirmed
                            : record.fullDayOvertime?.type === '加一半' &&
                              record.fullDayOvertime.firstHalfMember?.confirmed &&
                              record.fullDayOvertime.secondHalfMember?.confirmed;
                        const hasConfirmedCustomOvertime = record.customOvertime?.confirmed;
                        const isConfirmed = isFullDayOvertimeComplete || hasConfirmedCustomOvertime;
                        
                        // 根據角色和狀態設置樣式
                        const role = getMemberRole(record.name);
                        let tagClass = '';
                        
                        if (isConfirmed) {
                            tagClass = 'bg-gray-200 text-gray-500';
                        } else if (role === '班長') {
                            tagClass = 'bg-red-100 text-red-700';
                        } else {
                            tagClass = 'bg-blue-100 text-blue-700';
                        }
                        
                        // 根據請假記錄數量調整字體大小
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