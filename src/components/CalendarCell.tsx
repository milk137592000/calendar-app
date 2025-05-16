'use client';

import React from 'react';
import { format, isSameDay, parse } from 'date-fns';
import { zhTW } from 'date-fns/locale';
import { TEAMS } from '@/data/teams';
import { getShiftForDate, calculateTeamDeficit, getMemberRole, getMemberTeam } from '@/utils/schedule';
import type { LeaveRecord } from '@/types/LeaveRecord';
import type { DaySchedule, ShiftType } from '@/types/schedule';

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

    // Helper: 獲取請假人原始班別
    const getMemberOriginalShift = (memberName: string) => {
        const memberTeam = getMemberTeam(memberName); // 假設 getMemberTeam 已正確引入或定義
        return memberTeam ? shifts[memberTeam as keyof typeof shifts] : null;
    };

    // Helper: Find a team by a specific shift type for the current day
    const findTeamByShiftType = (targetShift: ShiftType): string | null => {
        for (const [team, shift] of Object.entries(shifts)) {
            if (shift === targetShift) {
                return team;
            }
        }
        return null;
    };

    // 獲取建議加班班級
    const getSuggestedOvertimeTeams = (record: LeaveRecord) => {
        const suggestions = new Set<string>();
        const leaverOriginalTeam = getMemberTeam(record.name);
        const memberOriginalShift = getMemberOriginalShift(record.name);

        const detailedLog = record.date === '2025-05-13' || record.date === '2025-05-17' || record.date === '2025-05-20' || record.date === '2025-05-24';

        if (detailedLog) {
            console.log(`[getSuggestedOvertimeTeams DETAILED TRACE] Record: ${record.name} (Leaver Original Team: ${leaverOriginalTeam || 'N/A'}), Date: ${record.date}, Leaver Original Shift (on this date): ${memberOriginalShift || 'N/A'}`);
        }

        const addSuggestion = (suggestedTeam: string | null | undefined, half: 'FH' | 'SH' | 'FullDay' | 'Custom') => {
            if (detailedLog) {
                console.log(`  [${half}] Attempting to suggest: '${suggestedTeam}'. Leaver's team: '${leaverOriginalTeam}'. Rule: suggestedTeam && suggestedTeam !== leaverOriginalTeam.`);
            }
            if (suggestedTeam && suggestedTeam !== leaverOriginalTeam) {
                suggestions.add(suggestedTeam);
                if (detailedLog) {
                    console.log(`    [${half}] Added '${suggestedTeam}' to suggestions.`);
                }
            } else if (detailedLog) {
                if (!suggestedTeam) {
                    console.log(`    [${half}] Did not add: Suggested team is null/undefined.`);
                } else if (suggestedTeam === leaverOriginalTeam) {
                    console.log(`    [${half}] Did not add: Suggested team '${suggestedTeam}' is leaver's own team.`);
                }
            }
        };

        if (record.period === 'fullDay' && record.fullDayOvertime) {
            if (record.fullDayOvertime.type === '加一半') {
                // First Half
                const fhProvidedTeam = record.fullDayOvertime.firstHalfMember?.team;
                const fhConfirmed = record.fullDayOvertime.firstHalfMember?.confirmed || false;
                if (detailedLog) {
                    console.log(`  [FH] Provided Info: .team='${fhProvidedTeam || 'empty'}', .confirmed=${fhConfirmed}`);
                }

                if (!fhConfirmed) {
                    let teamToSuggest1: string | null = null;
                    if (fhProvidedTeam) {
                        teamToSuggest1 = fhProvidedTeam;
                        if (detailedLog) console.log(`  [FH] Using provided .team field: '${teamToSuggest1}'.`);
                    } else if (memberOriginalShift) { // MODIFIED: Use dynamic suggestion
                        if (memberOriginalShift === '早班') teamToSuggest1 = findTeamByShiftType('中班');
                        else if (memberOriginalShift === '中班') teamToSuggest1 = findTeamByShiftType('早班');
                        else if (memberOriginalShift === '夜班') teamToSuggest1 = findTeamByShiftType('早班'); // Simplified: current day's early shift as stand-in
                        // Add more conditions if other original shifts like '小休', '大休' need specific suggestions for FH
                        if (detailedLog) console.log(`  [FH] .team field empty. Derived dynamic suggestion for '${memberOriginalShift}' leaver: '${teamToSuggest1 || 'None found'}'.`);
                    }
                    addSuggestion(teamToSuggest1, 'FH');
                } else if (detailedLog) {
                    console.log(`  [FH] Slot is confirmed. No suggestion needed.`);
                }

                // Second Half
                const shProvidedTeam = record.fullDayOvertime.secondHalfMember?.team;
                const shConfirmed = record.fullDayOvertime.secondHalfMember?.confirmed || false;
                if (detailedLog) {
                    console.log(`  [SH] Provided Info: .team='${shProvidedTeam || 'empty'}', .confirmed=${shConfirmed}`);
                }

                if (!shConfirmed) {
                    let teamToSuggest2: string | null = null;
                    if (shProvidedTeam) {
                        teamToSuggest2 = shProvidedTeam;
                        if (detailedLog) console.log(`  [SH] Using provided .team field: '${teamToSuggest2}'.`);
                    } else if (memberOriginalShift) { // MODIFIED: Use dynamic suggestion
                        if (memberOriginalShift === '早班') {
                            teamToSuggest2 = findTeamByShiftType('小休');
                            if (!teamToSuggest2) teamToSuggest2 = findTeamByShiftType('夜班');
                        } else if (memberOriginalShift === '中班') {
                            teamToSuggest2 = findTeamByShiftType('小休');
                            if (!teamToSuggest2) teamToSuggest2 = findTeamByShiftType('夜班');
                        } else if (memberOriginalShift === '夜班') {
                            teamToSuggest2 = findTeamByShiftType('中班'); // Simplified: current day's mid shift as stand-in
                        }
                        // Add more conditions if other original shifts like '小休', '大休' need specific suggestions for SH
                        if (detailedLog) console.log(`  [SH] .team field empty. Derived dynamic suggestion for '${memberOriginalShift}' leaver: '${teamToSuggest2 || 'None found'}'.`);
                    }
                    addSuggestion(teamToSuggest2, 'SH');
                } else if (detailedLog) {
                    console.log(`  [SH] Slot is confirmed. No suggestion needed.`);
                }
            } else if (record.fullDayOvertime.type === '加整班') {
                const fullDayProvidedTeam = record.fullDayOvertime.fullDayMember?.team;
                const fullDayConfirmed = record.fullDayOvertime.fullDayMember?.confirmed || false;
                if (detailedLog) {
                    console.log(`  [FullDay] Provided Info: .team='${fullDayProvidedTeam || 'empty'}', .confirmed=${fullDayConfirmed}`);
                }
                if (!fullDayConfirmed) {
                    let teamToSuggestFull: string | null = null;
                    if (fullDayProvidedTeam) {
                        teamToSuggestFull = fullDayProvidedTeam;
                        if (detailedLog) console.log(`  [FullDay] Using provided .team field: '${teamToSuggestFull}'.`);
                    } else {
                        teamToSuggestFull = getBigRestTeam(); // Fallback to big rest team
                        if (detailedLog) console.log(`  [FullDay] .team field empty. Derived suggestion (big rest): '${teamToSuggestFull}'.`);
                    }
                    addSuggestion(teamToSuggestFull, 'FullDay');
                } else if (detailedLog) {
                    console.log(`  [FullDay] Slot is confirmed. No suggestion needed.`);
                }
            }
        } else if (typeof record.period === 'object' && record.period.type === 'custom' && record.customOvertime) {
            const customProvidedTeam = record.customOvertime.team;
            const customConfirmed = record.customOvertime.confirmed || false;
            if (detailedLog) {
                console.log(`  [Custom] Provided Info: .team='${customProvidedTeam || 'empty'}', .confirmed=${customConfirmed}`);
            }
            if (!customConfirmed) {
                if (customProvidedTeam) { // For custom, we only use provided team currently
                    addSuggestion(customProvidedTeam, 'Custom');
                } else if (detailedLog) {
                    console.log(`  [Custom] .team field empty. No derivation logic for custom overtime suggestions currently.`);
                }
            } else if (detailedLog) {
                console.log(`  [Custom] Slot is confirmed. No suggestion needed.`);
            }
        }

        if (detailedLog) {
            console.log(`  [getSuggestedOvertimeTeams DETAILED TRACE] Final suggestions for ${record.name} on ${record.date}: [${Array.from(suggestions).join(', ')}]`);
            console.log(`  --------------------`);
        }
        return Array.from(suggestions);
    };

    // Helper function to get deficit label for the current team
    const getDeficitLabelForTeam = (
        record: LeaveRecord,
        currentSelectedTeam: string | undefined,
        // allShiftsOnDate: DaySchedule['shifts'], // Already available as 'shifts' prop
        getLeaverOriginalShift: (memberName: string) => string | null,
        getBigRestTeamOnDate: () => string | null
    ): string => {
        if (!currentSelectedTeam) return "";

        const leaverName = record.name;
        const leaverOriginalTeam = getMemberTeam(leaverName);

        if (currentSelectedTeam === leaverOriginalTeam) return ""; // Don't show for leaver's own team calendar

        const overtime = record.fullDayOvertime;
        const customO = record.customOvertime;

        if (record.period === 'fullDay' && overtime) {
            const leaverShiftToday = getLeaverOriginalShift(leaverName);

            if (overtime.type === '加一半') {
                // First Half
                if (!overtime.firstHalfMember?.confirmed) {
                    let isRelevant = false;
                    if (overtime.firstHalfMember?.team === currentSelectedTeam) {
                        isRelevant = true;
                    } else if (!overtime.firstHalfMember?.team && leaverShiftToday) {
                        let suggestedFH = null;
                        if (leaverShiftToday === '早班') suggestedFH = findTeamByShiftType('中班');
                        else if (leaverShiftToday === '中班') suggestedFH = findTeamByShiftType('早班');
                        else if (leaverShiftToday === '夜班') suggestedFH = findTeamByShiftType('早班');
                        if (suggestedFH === currentSelectedTeam) isRelevant = true;
                    }
                    if (isRelevant) return ` (前半缺)`;
                }

                // Second Half (only if first half was not relevant or was filled)
                if (!overtime.secondHalfMember?.confirmed) {
                    let isRelevant = false;
                    if (overtime.secondHalfMember?.team === currentSelectedTeam) {
                        isRelevant = true;
                    } else if (!overtime.secondHalfMember?.team && leaverShiftToday) {
                        let suggestedSH = null;
                        if (leaverShiftToday === '早班') {
                            suggestedSH = findTeamByShiftType('小休');
                            if (!suggestedSH) suggestedSH = findTeamByShiftType('夜班');
                        } else if (leaverShiftToday === '中班') {
                            suggestedSH = findTeamByShiftType('小休');
                            if (!suggestedSH) suggestedSH = findTeamByShiftType('夜班');
                        } else if (leaverShiftToday === '夜班') {
                            suggestedSH = findTeamByShiftType('中班');
                        }
                        if (suggestedSH === currentSelectedTeam) isRelevant = true;
                    }
                    // Important: Ensure this deficit applies if the first half didn't return a label for this team.
                    if (isRelevant) return ` (後半缺)`;
                }
            } else if (overtime.type === '加整班') {
                if (!overtime.fullDayMember?.confirmed) {
                    let isRelevant = false;
                    if (overtime.fullDayMember?.team === currentSelectedTeam) {
                        isRelevant = true;
                    } else if (!overtime.fullDayMember?.team) {
                        const bigRestTeam = getBigRestTeamOnDate();
                        if (bigRestTeam === currentSelectedTeam) isRelevant = true;
                    }
                    if (isRelevant) return ` (全日缺)`;
                }
            }
        }
        // Custom overtime
        else if (typeof record.period === 'object' && record.period.type === 'custom' && customO) {
            if (!customO.confirmed && customO.team === currentSelectedTeam && currentSelectedTeam !== leaverOriginalTeam) {
                return ` (時段缺)`;
            }
        }
        return "";
    };

    // 判斷是否應該顯示請假記錄
    const shouldShowLeaveRecord = (record: LeaveRecord) => {
        if (isLeaveMode) return true;
        if (!selectedTeam) return false;

        // 針對A班的特殊條件，確保所有與A班加班相關的請假記錄都能顯示
        if (selectedTeam === 'A') {
            // 檢查全天請假記錄
            if (record.period === 'fullDay' && record.fullDayOvertime) {
                // 加整班情況：檢查是否指定A班且未確認
                if (record.fullDayOvertime.type === '加整班' &&
                    !record.fullDayOvertime.fullDayMember?.confirmed &&
                    record.fullDayOvertime.fullDayMember?.team === 'A') {
                    return true;
                }
                // 加一半情況：檢查前半或後半是否指定A班且未確認
                if (record.fullDayOvertime.type === '加一半') {
                    if (!record.fullDayOvertime.firstHalfMember?.confirmed &&
                        record.fullDayOvertime.firstHalfMember?.team === 'A') {
                        return true;
                    }
                    if (!record.fullDayOvertime.secondHalfMember?.confirmed &&
                        record.fullDayOvertime.secondHalfMember?.team === 'A') {
                        return true;
                    }
                }
            }
            // 檢查自定義時段請假記錄
            else if (typeof record.period === 'object' && record.period.type === 'custom' &&
                record.customOvertime && !record.customOvertime.confirmed &&
                record.customOvertime.team === 'A') {
                return true;
            }

            // 根據請假人的原始班別和當日排班情況進行動態建議檢查
            const memberOriginalShift = getMemberOriginalShift(record.name);
            const leaverOriginalTeam = getMemberTeam(record.name);

            // 只為非A班成員進行建議
            if (leaverOriginalTeam !== 'A' && memberOriginalShift) {
                // 針對不同班別，檢查A班是否應該被推薦為建議加班班級
                const A班當日班別 = shifts['A' as keyof typeof shifts];

                if (record.period === 'fullDay' && record.fullDayOvertime?.type === '加一半') {
                    // 前半檢查
                    if (!record.fullDayOvertime.firstHalfMember?.confirmed &&
                        !record.fullDayOvertime.firstHalfMember?.team) { // 未指定班級
                        if ((memberOriginalShift === '早班' && A班當日班別 === '中班') ||
                            (memberOriginalShift === '中班' && A班當日班別 === '早班') ||
                            (memberOriginalShift === '夜班' && A班當日班別 === '早班')) {
                            return true;
                        }
                    }
                    // 後半檢查
                    if (!record.fullDayOvertime.secondHalfMember?.confirmed &&
                        !record.fullDayOvertime.secondHalfMember?.team) { // 未指定班級
                        if ((memberOriginalShift === '早班' && (A班當日班別 === '小休' || A班當日班別 === '夜班')) ||
                            (memberOriginalShift === '中班' && (A班當日班別 === '小休' || A班當日班別 === '夜班')) ||
                            (memberOriginalShift === '夜班' && A班當日班別 === '中班')) {
                            return true;
                        }
                    }
                }
                // 加整班情況
                else if (record.period === 'fullDay' && record.fullDayOvertime?.type === '加整班' &&
                    !record.fullDayOvertime.fullDayMember?.confirmed &&
                    !record.fullDayOvertime.fullDayMember?.team) { // 未指定班級
                    if (A班當日班別 === '大休') {
                        return true;
                    }
                }
            }
        }

        // 常規判斷邏輯
        const suggestedTeams = getSuggestedOvertimeTeams(record);
        const shouldShow = suggestedTeams.includes(selectedTeam);

        // --- 詳細日誌開始 for shouldShowLeaveRecord ---
        if (record.date === '2025-05-17' || record.date === '2025-05-20' || record.date === '2025-05-24' || record.date === '2025-05-13') {
            const originalShift = getMemberOriginalShift(record.name); // Re-fetch for this log context
            console.log(`[shouldShowLeaveRecord Debug] Date: ${record.date}, SelectedTeam: ${selectedTeam}`);
            console.log(`  Record Name: ${record.name}, Original Shift: ${originalShift}`);
            console.log(`  Processed Suggested Teams: [${suggestedTeams.join(', ')}]`);
            console.log(`  Should show tag for ${record.name} on ${selectedTeam} calendar? ${shouldShow}`);
            console.log(`  --------------------`);
        }
        // --- 詳細日誌結束 for shouldShowLeaveRecord ---

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
                    {dayLeaveRecords.map((record, index) => {
                        if (!shouldShowLeaveRecord(record)) {
                            return null;
                        }

                        const deficitLabel = getDeficitLabelForTeam(
                            record,
                            selectedTeam,
                            getMemberOriginalShift,
                            getBigRestTeam
                        );

                        // 檢查加班是否已完成 (Restoring original logic for styling)
                        const isFullDayOvertimeComplete = record.fullDayOvertime?.type === '加整班'
                            ? record.fullDayOvertime.fullDayMember?.confirmed
                            : record.fullDayOvertime?.type === '加一半' &&
                            record.fullDayOvertime.firstHalfMember?.confirmed &&
                            record.fullDayOvertime.secondHalfMember?.confirmed;
                        const hasConfirmedCustomOvertime = record.customOvertime?.confirmed;
                        const isConfirmed = isFullDayOvertimeComplete || hasConfirmedCustomOvertime;

                        // 根據角色和狀態設置樣式 (Restoring original logic for styling)
                        const role = getMemberRole(record.name);
                        let tagClass = '';

                        if (isConfirmed) {
                            tagClass = 'bg-gray-200 text-gray-500';
                        } else if (role === '班長') {
                            tagClass = 'bg-red-100 text-red-700';
                        } else {
                            tagClass = 'bg-blue-100 text-blue-700';
                        }

                        // 根據請假記錄數量調整字體大小 (Restoring original logic for styling)
                        const fontSizeClass = dayLeaveRecords.length > 4
                            ? 'text-[7px]'
                            : 'text-[9px]';

                        return (
                            <div
                                key={`${record._id || record.name}-${index}`} // Using new key format is fine
                                className={`flex items-center gap-1 ${tagClass} ${fontSizeClass} px-1 py-0.5 rounded whitespace-nowrap cursor-pointer hover:opacity-80`} // Restored classes
                                onClick={(e) => { // Restored onClick
                                    e.stopPropagation();
                                    if (onToggleLeave) {
                                        onToggleLeave(date);
                                    }
                                }}
                                title={`${record.name} (${typeof record.period === 'object' ? `${format(parse(record.period.startTime, 'HH:mm', new Date()), 'HH:mm')} - ${format(parse(record.period.endTime, 'HH:mm', new Date()), 'HH:mm')}` : '全天'})${deficitLabel}`} // deficitLabel in title
                            >
                                {record.name} {/* MODIFIED: Only show name directly */}
                                {/* 若為建議加班班級，顯示標註 (Restored "可加班" span) */}
                                {isLeaveMode && isSuggestedOvertime(record) && (
                                    <span className="ml-1 px-1 py-0.5 bg-yellow-200 text-yellow-800 rounded text-[8px]">可加班</span>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* 農曆日期 */}
            {lunarDate && (
                <div className="text-xs text-gray-500 text-center mt-1">
                    {lunarDate}
                </div>
            )}
        </div>
    );
};

export default CalendarCell; 