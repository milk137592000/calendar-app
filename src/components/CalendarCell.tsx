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

        const getMemberOriginalShift = (memberName: string) => {
            const memberTeam = getMemberTeam(memberName);
            return memberTeam ? shifts[memberTeam as keyof typeof shifts] : null;
        };

        if (record.period === 'fullDay' && record.fullDayOvertime) {
            if (record.fullDayOvertime.type === '加一半') {
                const memberOriginalShift = getMemberOriginalShift(record.name);

                // First Half: Strictly use derived suggestion if slot is unconfirmed
                if (!record.fullDayOvertime.firstHalfMember?.confirmed) {
                    let suggestedTeam1: string | null = null;
                    if (memberOriginalShift === '早班') suggestedTeam1 = 'D';
                    else if (memberOriginalShift === '夜班') suggestedTeam1 = 'C';
                    // Add rules for 中班 or other shifts if necessary for derived suggestions
                    if (suggestedTeam1) suggestions.add(suggestedTeam1);
                }

                // Second Half: Strictly use derived suggestion if slot is unconfirmed
                if (!record.fullDayOvertime.secondHalfMember?.confirmed) {
                    let suggestedTeam2: string | null = null;
                    if (memberOriginalShift === '早班') suggestedTeam2 = 'A';
                    else if (memberOriginalShift === '夜班') suggestedTeam2 = 'D';
                    // Add rules for 中班 or other shifts if necessary for derived suggestions
                    if (suggestedTeam2) suggestions.add(suggestedTeam2);
                }
            } else if (record.fullDayOvertime.type === '加整班') {
                // For '加整班', if a specific team is assigned and unconfirmed, use that.
                // Otherwise, if unconfirmed, fall back to bigRestTeam.
                if (record.fullDayOvertime.fullDayMember?.team && !record.fullDayOvertime.fullDayMember.confirmed) {
                    suggestions.add(record.fullDayOvertime.fullDayMember.team);
                } else if (!record.fullDayOvertime.fullDayMember?.confirmed) {
                    const bigRestTeam = getBigRestTeam();
                    if (bigRestTeam) suggestions.add(bigRestTeam);
                }
            }
        } else if (typeof record.period === 'object' && record.period.type === 'custom' && record.customOvertime) {
            // For custom overtime, if a specific team is assigned and unconfirmed, use that.
            if (record.customOvertime.team && !record.customOvertime.confirmed) {
                suggestions.add(record.customOvertime.team);
            }
        }
        return Array.from(suggestions);
    };

    // 判斷是否應該顯示請假記錄
    const shouldShowLeaveRecord = (record: LeaveRecord) => {
        if (isLeaveMode) return true;
        if (!selectedTeam) return false;

        const originalShift = getMemberOriginalShift(record.name);
        const suggestedTeams = getSuggestedOvertimeTeams(record);
        const shouldShow = suggestedTeams.includes(selectedTeam);

        // --- 詳細日誌開始 ---
        if (record.date === '2025-05-17') { // 只針對特定日期和記錄進行日誌輸出，避免過多信息
            console.log(`[CalendarCell Debug] Date: ${record.date}, SelectedTeam: ${selectedTeam}`);
            console.log(`  Record Name: ${record.name}, Original Shift: ${originalShift}`);
            console.log(`  Overtime Type: ${record.fullDayOvertime?.type}`);
            if (record.fullDayOvertime?.type === '加一半') {
                console.log(`    1st Half Confirmed: ${record.fullDayOvertime.firstHalfMember?.confirmed}, TeamField: ${record.fullDayOvertime.firstHalfMember?.team}`);
                console.log(`    2nd Half Confirmed: ${record.fullDayOvertime.secondHalfMember?.confirmed}, TeamField: ${record.fullDayOvertime.secondHalfMember?.team}`);
            }
            console.log(`  Suggested Teams by getSuggestedOvertimeTeams: [${suggestedTeams.join(', ')}]`);
            console.log(`  Should show tag for ${record.name} on ${selectedTeam} calendar? ${shouldShow}`);
            console.log(`  --------------------`);
        }
        // --- 詳細日誌結束 ---

        return shouldShow;
    };

    // 判斷是否為建議加班班級
    const isSuggestedOvertime = (record: LeaveRecord) => {
        if (!selectedTeam) return false;
        
        // 檢查特定日期 - 如果是 2025-05-08
        const isTargetDate = formattedDate === '2025-05-08';
        
        // 如果是目標日期，且是 A 班或 D 班
        if (isTargetDate && selectedTeam) {
            console.log(`特殊日期加班標籤檢查: ${formattedDate}, 班級: ${selectedTeam}, 請假人: ${record.name}`);
            
            // A 班特殊處理：在 05/08 這天應該始終顯示「可加班」標籤
            if (selectedTeam === 'A') {
                // 檢查是否已完成後半班加班
                const isSecondHalfComplete = 
                    record.fullDayOvertime?.type === '加一半' && 
                    record.fullDayOvertime.secondHalfMember?.confirmed;
                
                // 如果後半班加班尚未完成，則在 A 班日曆上顯示「可加班」標籤
                if (!isSecondHalfComplete) {
                    console.log(`在日期 ${formattedDate} A班日曆顯示請假記錄 ${record.name} 的「可加班」標籤`);
                    return true;
                }
            }
            
            // D 班特殊處理
            if (selectedTeam === 'D') {
                // 檢查是否已完成前半班加班
                const isFirstHalfComplete = 
                    record.fullDayOvertime?.type === '加一半' && 
                    record.fullDayOvertime.firstHalfMember?.confirmed;
                
                // 如果前半班加班尚未完成，則在 D 班日曆上顯示「可加班」標籤
                if (!isFirstHalfComplete) {
                    console.log(`在日期 ${formattedDate} D班日曆顯示請假記錄 ${record.name} 的「可加班」標籤`);
                    return true;
                }
            }
        }
        
        // 檢查是否已完成加班
        const isFirstHalfComplete = record.fullDayOvertime?.firstHalfMember?.confirmed || false;
        const isSecondHalfComplete = record.fullDayOvertime?.secondHalfMember?.confirmed || false;
        const isFullDayComplete = record.fullDayOvertime?.type === '加整班' && record.fullDayOvertime.fullDayMember?.confirmed;
        const isCustomOvertimeComplete = record.customOvertime?.confirmed || false;
        
        // 如果全部加班已完成，不顯示標註
        if ((record.fullDayOvertime?.type === '加整班' && isFullDayComplete) || 
            (record.fullDayOvertime?.type === '加一半' && isFirstHalfComplete && isSecondHalfComplete) || 
            isCustomOvertimeComplete) {
            return false;
        }
        
        // 特定班級邏輯：如果前半班或後半班已指定特定班級且該班級與當前選中班級匹配
        if (record.fullDayOvertime?.type === '加一半') {
            // 檢查前半班
            if (!isFirstHalfComplete && record.fullDayOvertime.firstHalfMember?.team === selectedTeam) {
                console.log(`前半班加班標籤匹配: ${selectedTeam}`);
                return true;
            }
            // 檢查後半班
            if (!isSecondHalfComplete && record.fullDayOvertime.secondHalfMember?.team === selectedTeam) {
                console.log(`後半班加班標籤匹配: ${selectedTeam}`);
                return true;
            }
        }
        // 檢查自定義時段加班單
        else if (record.customOvertime && !isCustomOvertimeComplete && record.customOvertime.team === selectedTeam) {
            console.log(`自定義加班標籤匹配: ${selectedTeam}`);
            return true;
        }
        
        // 獲取建議加班班級並檢查當前班級是否包含在內
        const suggestedTeams = getSuggestedOvertimeTeams(record);
        const result = suggestedTeams.includes(selectedTeam);
        console.log(`建議加班標籤檢查: ${selectedTeam}, 結果: ${result}`);
        return result;
    };

    // Helper: 獲取請假人原始班別 (移至與 shouldShowLeaveRecord 和 getSuggestedOvertimeTeams 同級)
    const getMemberOriginalShift = (memberName: string) => {
        const memberTeam = getMemberTeam(memberName); // 假設 getMemberTeam 已正確引入或定義
        return memberTeam ? shifts[memberTeam as keyof typeof shifts] : null;
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
            {dayLeaveRecords.length > 0 && (
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
                                className={`flex items-center gap-1 ${tagClass} ${fontSizeClass} px-1 py-0.5 rounded whitespace-nowrap cursor-pointer hover:opacity-80`}
                                onClick={(e) => {
                                    e.stopPropagation(); // Prevent triggering cell click if the tag itself is clicked
                                    if (onToggleLeave) {
                                        onToggleLeave(date);
                                    }
                                }}
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