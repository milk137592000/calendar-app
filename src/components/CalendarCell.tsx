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
    daySchedule?: {
        date: string;
        shifts: DaySchedule['shifts'];
        leaveRecords?: LeaveRecord[];
        holidays?: string[];
    };
}

const CalendarCell: React.FC<CalendarCellProps> = ({
    date,
    shifts,
    selectedTeam,
    isLeaveMode,
    leaveRecords,
    onToggleLeave,
    isToday,
    lunarDate,
    daySchedule
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
            // 如果已經有加班人員且已確認，不顯示建議
            if (record.fullDayOvertime?.type === '加整班' && record.fullDayOvertime.fullDayMember?.confirmed) {
                return [];
            }
            
            // 加一半的情況，檢查哪個時段仍需要人員
            if (record.fullDayOvertime?.type === '加一半') {
                const needsFirstHalf = !record.fullDayOvertime.firstHalfMember?.confirmed;
                const needsSecondHalf = !record.fullDayOvertime.secondHalfMember?.confirmed;
                
                if (!needsFirstHalf && !needsSecondHalf) {
                    return []; // 兩個時段都已確認，不需要加班
                }
                
                // 獲取可替代的班級
                // 優先考慮大休班級
                const bigRestTeam = getBigRestTeam();
                if (bigRestTeam) {
                    suggestions.add(bigRestTeam);
                }
                
                // 如果請假人員是上一班的班別，則下一班也可以支援
                if (leaveTeam) {
                    // 可能的支援班級（同區域的其他班別）
                    Object.entries(shifts).forEach(([team, shift]) => {
                        // 避免與請假人員同班
                        if (team !== leaveTeam) {
                            // 可排加班的條件: 大休或小休班級，或者連續班別
                            if (shift === '大休' || shift === '小休' || 
                                (leaveShift === '早班' && shift === '中班') || 
                                (leaveShift === '中班' && shift === '夜班') || 
                                (leaveShift === '夜班' && shift === '早班')) {
                                suggestions.add(team);
                            }
                        }
                    });
                }
            } else {
                // 加整班或未設定加班類型的情況
                // 優先考慮大休班級
                const bigRestTeam = getBigRestTeam();
                if (bigRestTeam) {
                    suggestions.add(bigRestTeam);
                    return Array.from(suggestions); // 如果有大休班級，只建議大休班級加班
                }
                
                // 其次考慮小休班級
                Object.entries(shifts).forEach(([team, shift]) => {
                    if (shift === '小休') {
                        suggestions.add(team);
                    }
                });
                
                // 如果沒有大休或小休班級，則所有班級都可以考慮（緊急情況）
                if (suggestions.size === 0 && leaveTeam) {
                    Object.entries(shifts).forEach(([team, shift]) => {
                        if (team !== leaveTeam) {
                            suggestions.add(team);
                        }
                    });
                }
            }
        } 
        // 如果是自定義時段請假
        else if (typeof record.period === 'object' && record.period.type === 'custom') {
            // 如果加班人員已確認，不顯示建議
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
            if (leaveShift === '早班' && startTime === '0815') {
                const prevTeam = Object.entries(shifts).find(([_, shift]) => shift === '夜班')?.[0];
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
            if (leaveShift === '夜班' && endTime === '0815') {
                const nextTeam = Object.entries(shifts).find(([_, shift]) => shift === '早班')?.[0];
                if (nextTeam) suggestions.add(nextTeam);
            }
            
            // 如果沒有找到合適的班級，大休班級可以支援
            if (suggestions.size === 0) {
                const bigRestTeam = getBigRestTeam();
                if (bigRestTeam) suggestions.add(bigRestTeam);
            }
        }

        return Array.from(suggestions);
    };

    // 判斷是否應該顯示請假記錄
    const shouldShowLeaveRecord = (record: LeaveRecord) => {
        // 請假模式下，所有班級都顯示請假資訊
        if (isLeaveMode) return true;
        
        // 非大休班級：只有可以支援加班的班級才顯示請假標籤
        if (selectedTeam) {
            // 檢查請假是否需要加班人員
            const needsOvertime = checkIfNeedsOvertime(record);
            if (!needsOvertime) return false;
            
            // 檢查是否為建議的加班班級
            const suggestedTeams = getSuggestedOvertimeTeams(record);
            return suggestedTeams.includes(selectedTeam);
        }
        
        return false;
    };

    // 檢查請假記錄是否還需要加班人員
    const checkIfNeedsOvertime = (record: LeaveRecord) => {
        // 全天請假的情況
        if (record.period === 'fullDay') {
            // 如果沒有設置加班資訊，表示需要加班
            if (!record.fullDayOvertime) return true;
            
            // 加整班的情況，檢查是否有確認的人員
            if (record.fullDayOvertime.type === '加整班') {
                return !record.fullDayOvertime.fullDayMember?.confirmed;
            }
            
            // 加一半的情況，檢查兩個時段是否都有確認的人員
            if (record.fullDayOvertime.type === '加一半') {
                const firstHalfFilled = record.fullDayOvertime.firstHalfMember?.confirmed;
                const secondHalfFilled = record.fullDayOvertime.secondHalfMember?.confirmed;
                return !firstHalfFilled || !secondHalfFilled;
            }
        }
        
        // 自定義時段請假的情況
        if (typeof record.period === 'object' && record.period.type === 'custom') {
            // 如果沒有設置加班資訊或未確認，表示需要加班
            return !record.customOvertime?.confirmed;
        }
        
        return false;
    };

    // 判斷是否為建議加班班級
    const isSuggestedOvertime = (record: LeaveRecord) => {
        if (!selectedTeam) return false;
        
        // 如果請假不需要加班人員，則不建議加班
        if (!checkIfNeedsOvertime(record)) return false;
        
        // 檢查是否為建議的加班班級
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
            {dayLeaveRecords.length > 0 && (isLeaveMode || selectedTeam) && (
                <div className="flex flex-col justify-center items-center gap-1 w-full mt-1">
                    {dayLeaveRecords.map((record, idx) => {
                        if (!shouldShowLeaveRecord(record)) {
                            return null;
                        }
                        
                        // 計算標籤樣式
                        let tagClass = '';
                        const role = getMemberRole(record.name);
                        const needsOvertime = checkIfNeedsOvertime(record);
                        
                        if (!needsOvertime) {
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
                                {/* 若為建議加班班級且需要加班，顯示標註 */}
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