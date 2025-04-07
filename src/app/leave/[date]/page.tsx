'use client';

import React, { useState, useEffect } from 'react';
import { format, isAfter, isToday, startOfDay, parse, addMinutes } from 'date-fns';
import { useParams, useRouter } from 'next/navigation';
import { TEAMS } from '@/data/teams';
import { getShiftForDate, getMemberTeam, isTeamBigRestOnTuesday, findBigRestMembers, findRegularMembers, getMemberRole } from '@/utils/schedule';
import type { LeaveRecord as LeaveRecordType, CustomPeriod } from '@/types/LeaveRecord';
import type { ShiftType } from '@/types/schedule';

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
    'A': 7,  // 大休是第8天
    'B': 1,  // 早班(第2天)是第2天
    'C': 3,  // 中班(第2天)是第4天
    'D': 5   // 夜班(第1天)是第6天
};

// 定義各班別的時段
const SHIFT_TIME_RANGES = {
    '早班': { start: '0815', end: '1615' },
    '中班': { start: '1615', end: '2315' },
    '夜班': { start: '2315', end: '0815' }
};

// 檢查時間是否在指定範圍內
const isTimeInRange = (time: string, shift: string): boolean => {
    // 檢查時間格式是否正確（HHMM）
    const timeRegex = /^([01][0-9]|2[0-3])[0-5][0-9]$/;
    if (!timeRegex.test(time.replace(':', ''))) {
        return false;
    }

    const timeNum = parseInt(time.replace(':', ''));
    const range = SHIFT_TIME_RANGES[shift as keyof typeof SHIFT_TIME_RANGES];

    if (!range) return false;

    const startNum = parseInt(range.start);
    const endNum = parseInt(range.end);

    // 處理跨日的情況（例如夜班 2315-0815）
    if (endNum < startNum) {
        return timeNum >= startNum || timeNum <= endNum;
    }

    return timeNum >= startNum && timeNum <= endNum;
};

// 驗證自定義時段
const validateCustomTimeRange = (startTime: string, endTime: string, shift: string | null): boolean => {
    if (!shift) return false;
    return isTimeInRange(startTime, shift) && isTimeInRange(endTime, shift);
};

// 更新LeaveRecord介面
interface LeaveRecord {
    _id: string;
    date: string;
    name: string;
    team?: string;
    period: {
        type: 'fullDay' | 'custom';
        startTime?: string;
        endTime?: string;
    } | 'fullDay';
    overtime?: {
        type: '全天' | '半天';
        name: string;
        team: string;
        confirmed: boolean;
        firstConfirmed: boolean;
        secondMember: {
            name: string;
            team: string;
            confirmed: boolean;
        } | null;
    };
    customOvertime?: {
        name: string;
        team: string;
        startTime: string;
        endTime: string;
        confirmed: boolean;
    };
}

interface CustomOvertimeCardProps {
    record: LeaveRecordType;
}

// 定義 CustomOvertime 類型
interface CustomOvertime {
    name: string;
    team: string;
    startTime: string;
    endTime: string;
    confirmed: boolean;
}

// 格式化時間顯示
const formatTimeDisplay = (time: string) => {
    if (!time) return '';
    if (time === '2400') return '00:00';
    return `${time.slice(0, 2)}:${time.slice(2)}`;
};

// 獲取班別的開始時間
const getShiftStartTime = (shift: ShiftType): number => {
    switch (shift) {
        case '早班': return 815;
        case '中班': return 1615;
        case '夜班': return 2315;
        default: return 0;
    }
};

// 獲取班別的結束時間
const getShiftEndTime = (shift: ShiftType): number => {
    switch (shift) {
        case '早班': return 1615;
        case '中班': return 2315;
        case '夜班': return 815;
        default: return 0;
    }
};

// 獲取上一班的班別
const getPreviousShift = (shift: ShiftType): ShiftType => {
    const shiftOrder: ShiftType[] = ['早班', '中班', '夜班'];
    const currentIndex = shiftOrder.indexOf(shift);
    return shiftOrder[(currentIndex - 1 + shiftOrder.length) % shiftOrder.length] as ShiftType;
};

// 獲取下一班的班別
const getNextShift = (shift: ShiftType): ShiftType => {
    const shiftOrder: ShiftType[] = ['早班', '中班', '夜班'];
    const currentIndex = shiftOrder.indexOf(shift);
    return shiftOrder[(currentIndex + 1) % shiftOrder.length] as ShiftType;
};

// 獲取指定班別的班級代號
const getTeamByShift = (shift: ShiftType, isPreviousDay: boolean = false, currentDate: string) => {
    const targetDate = new Date(currentDate);
    if (isPreviousDay) {
        targetDate.setDate(targetDate.getDate() - 1);
    }
    for (const [team, teamData] of Object.entries(TEAMS)) {
        const teamShift = getShiftForDate(targetDate, team);
        if (teamShift === shift) {
            return team;
        }
    }
    return '';
};

// 獲取班級當天班別
const getTeamShift = (team: string | undefined, currentDate: string): ShiftType | null => {
    if (!team) return null;
    return getShiftForDate(new Date(currentDate), team);
};

const LeaveDatePage: React.FC = () => {
    const router = useRouter();
    const params = useParams();
    const date = params.date as string;
    const formattedDate = format(new Date(date), 'yyyy年MM月dd日');

    const [selectedTeam, setSelectedTeam] = useState('');
    const [selectedMember, setSelectedMember] = useState('');
    const [selectedPeriod, setSelectedPeriod] = useState<'fullDay' | 'custom'>('fullDay');
    const [customStartTime, setCustomStartTime] = useState('');
    const [customEndTime, setCustomEndTime] = useState('');
    const [confirmedStartTime, setConfirmedStartTime] = useState('');
    const [confirmedEndTime, setConfirmedEndTime] = useState('');
    const [leaveRecords, setLeaveRecords] = useState<LeaveRecordType[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [record, setRecord] = useState<LeaveRecordType | null>(null);
    const [bigRestMembers, setBigRestMembers] = useState<string[]>([]);
    const [regularMembers, setRegularMembers] = useState<string[]>([]);
    const [timeOptions, setTimeOptions] = useState<string[]>([]);
    const [endTimeOptions, setEndTimeOptions] = useState<string[]>([]);
    const [selectedOvertimeType, setSelectedOvertimeType] = useState<string>("");
    const [overtimeSuggestions, setOvertimeSuggestions] = useState({ suggestion: '', reason: '' });
    const [selectedOvertimeMember, setSelectedOvertimeMember] = useState('');
    const [bigRestTeam, setBigRestTeam] = useState<string | null>(null);

    // 獲取請假記錄
    const fetchLeaveRecords = async () => {
        try {
            const response = await fetch(`/api/leave?date=${date}`);
            if (!response.ok) throw new Error('Failed to fetch leave records');
            const data = await response.json();
            console.log('獲取到的請假記錄:', data);
            setLeaveRecords(data);
        } catch (error) {
            console.error('Error fetching leave records:', error);
            setError('獲取請假記錄失敗');
        }
    };

    // FullDayOvertimeCard 組件 - 處理全天請假情況
    const FullDayOvertimeCard: React.FC<{ record: LeaveRecordType }> = ({ record }) => {
        const customOvertime = record.customOvertime;

        // 找出當天大休的班級
        let bigRestTeam = null;
        for (const [teamKey, teamData] of Object.entries(TEAMS)) {
            const shift = getShiftForDate(new Date(date), teamKey);
            if (shift === '大休') {
                bigRestTeam = teamKey;
                break;
            }
        }

        if (!customOvertime || !customOvertime.name) {
            return (
                <div className="space-y-4 p-4 bg-green-50 rounded-md border border-green-200">
                    {bigRestTeam && (
                        <div className="mb-4 p-2 bg-red-50 rounded-md border border-red-200">
                            <p className="text-sm text-red-600 font-medium">加班建議：{bigRestTeam}班大休</p>
                        </div>
                    )}
                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            <select
                                value={selectedOvertimeType}
                                onChange={(e) => setSelectedOvertimeType(e.target.value)}
                                className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                                disabled={record.overtime?.confirmed ||
                                    (record.overtime?.type === '半天' &&
                                        record.overtime?.firstConfirmed &&
                                        record.overtime?.secondMember?.confirmed)}
                            >
                                <option value="">請選擇加班類型</option>
                                {bigRestTeam && <option value="全天">加整班</option>}
                                <option value="半天">加一半</option>
                            </select>
                        </div>
                        {selectedOvertimeType === "全天" && bigRestTeam && (
                            <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                    <label className="block text-sm font-medium text-gray-700 whitespace-nowrap">
                                        選擇加班人員：
                                    </label>
                                    <select
                                        value=""
                                        onChange={(e) => handleOvertimeMemberChange(e, record)}
                                        className="flex-1 text-sm rounded border border-green-200 focus:border-green-500 focus:ring-green-500"
                                    >
                                        <option value="">請選擇加班人員</option>
                                        {TEAMS[bigRestTeam].members.map((member) => (
                                            <option key={member.name} value={member.name}>
                                                {member.name} ({member.role})
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            );
        }

        return (
            <div className="space-y-4 p-4 bg-green-50 rounded-md border border-green-200">
                <h3 className="text-green-800 font-medium">全天請假加班安排</h3>
                <div className="mt-2 space-y-2">
                    <p className="text-sm text-green-600">
                        加班人員: {customOvertime.name} ({customOvertime.team}班)
                    </p>
                    <p className="text-sm text-green-600">
                        加班時段: {selectedOvertimeType}
                    </p>
                </div>
            </div>
        );
    };

    // CustomOvertimeCard 組件 - 處理自定義時段請假情況
    const CustomOvertimeCard: React.FC<{ record: LeaveRecordType }> = ({ record }) => {
        const customOvertime = record.customOvertime;
        if (!customOvertime || !customOvertime.name) return null;

        return (
            <div className="space-y-2">
                <h3 className="font-medium text-gray-800">加班資訊</h3>
                <p className="text-gray-700">
                    <span className="font-medium">加班人員：</span>
                    {customOvertime.name}
                </p>
                {customOvertime.confirmed && (
                    <button
                        onClick={() => handleCancelOvertime(record)}
                        className="w-full px-3 py-1 text-sm font-medium text-white bg-red-500 rounded-md hover:bg-red-600"
                    >
                        取消加班
                    </button>
                )}
            </div>
        );
    };

    // 生成時間選項
    const generateTimeOptions = (shift: ShiftType | null): string[] => {
        if (!shift) return [];

        const times: string[] = [];
        let currentTime: Date;

        switch (shift) {
            case '早班':
                currentTime = parse('0815', 'HHmm', new Date());
                while (format(currentTime, 'HHmm') !== '1615') {
                    times.push(format(currentTime, 'HHmm'));
                    currentTime = addMinutes(currentTime, 30);
                }
                times.push('1615');
                break;
            case '中班':
                currentTime = parse('1615', 'HHmm', new Date());
                while (format(currentTime, 'HHmm') !== '2315') {
                    times.push(format(currentTime, 'HHmm'));
                    currentTime = addMinutes(currentTime, 30);
                }
                times.push('2315');
                break;
            case '夜班':
                currentTime = parse('2315', 'HHmm', new Date());
                // 處理跨日的情況
                while (format(currentTime, 'HHmm') !== '0815') {
                    times.push(format(currentTime, 'HHmm'));
                    currentTime = addMinutes(currentTime, 30);
                    if (format(currentTime, 'HHmm') === '0000') {
                        currentTime = parse('0000', 'HHmm', new Date());
                    }
                }
                times.push('0815');
                break;
        }

        return times;
    };

    // 驗證時間順序是否正確
    const isValidTimeOrder = (startTime: string, endTime: string): boolean => {
        const start = parseInt(startTime);
        const end = parseInt(endTime);

        // 處理跨日的情況（例如夜班 2315-0815）
        if (end < start) {
            // 如果結束時間小於開始時間，檢查是否為夜班的情況
            const memberTeam = getMemberTeam(selectedMember);
            const shift = memberTeam ? getTeamShift(memberTeam, date) : null;
            return shift === '夜班';
        }

        return start < end;
    };

    // 驗證時段格式
    const isValidTimeFormat = (time: string) => {
        // 格式應為 "HHMM-HHMM"
        const regex = /^([01][0-9]|2[0-3])([0-5][0-9])-([01][0-9]|2[0-3])([0-5][0-9])$/;
        if (!regex.test(time)) return false;

        // 解析時間
        const [start, end] = time.split('-');
        const startHour = parseInt(start.substring(0, 2));
        const startMinute = parseInt(start.substring(2, 4));
        const endHour = parseInt(end.substring(0, 2));
        const endMinute = parseInt(end.substring(2, 4));

        // 檢查時間範圍
        if (startHour > 23 || endHour > 23 || startMinute > 59 || endMinute > 59) return false;

        // 檢查結束時間是否晚於開始時間
        const startTime = startHour * 60 + startMinute;
        const endTime = endHour * 60 + endMinute;
        return endTime > startTime;
    };

    // 檢查日期是否不晚於今天
    const isNotFutureDate = () => {
        const today = startOfDay(new Date());
        const selectedDate = startOfDay(new Date(date));
        return isAfter(today, selectedDate);
    };

    // 檢查日期是否為今天或以後
    const isTodayOrFuture = () => {
        const today = startOfDay(new Date());
        const selectedDate = startOfDay(new Date(date));
        return !isAfter(today, selectedDate);
    };

    useEffect(() => {
        fetchLeaveRecords();
    }, [date]);

    // 獲取指定日期的班別
    const getShiftForDate = (date: Date, team: string): ShiftType | null => {
        const startDate = new Date('2025/04/01');
        const daysDiff = Math.floor((date.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
        const cyclePosition = (TEAM_START_POSITIONS[team] + daysDiff) % 8;

        if (cyclePosition < 0 || cyclePosition >= 8) {
            return null;
        }

        const shift = SHIFT_CYCLE[cyclePosition];
        return shift;
    };

    // 生成班級選項時預先計算班別
    const teamOptions = React.useMemo(() => {
        return Object.keys(TEAMS).map(teamKey => {
            const teamShift = getShiftForDate(new Date(date), teamKey);
            return {
                value: teamKey,
                label: `${teamKey}班 (${teamShift || '無班別'})`,
                canLeave: teamShift && teamShift !== '小休' && teamShift !== '大休'
            };
        });
    }, [date]);

    // 檢查是否可以請假
    const canTakeLeave = (team: string, memberName: string) => {
        if (isNotFutureDate()) {
            return false;
        }

        // 檢查是否已經請過假
        const hasAlreadyTakenLeave = leaveRecords.some(record =>
            record.date === date && record.name === memberName
        );
        if (hasAlreadyTakenLeave) {
            return false;
        }

        const shift = getShiftForDate(new Date(date), team);
        if (!shift) return false;

        if (shift === '大休') {
            return false;
        }
        return true;
    };

    // 檢查班級在週二是否為大休
    const isTeamBigRestOnTuesday = (team: string) => {
        const startDate = new Date(2025, 3, 1); // 2025/04/01
        const targetDate = new Date(date);
        const daysDiff = Math.floor((targetDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

        const startPos = TEAM_START_POSITIONS[team];
        const cyclePosition = ((startPos - 1 + daysDiff) % 8 + 8) % 8;
        const shift = SHIFT_CYCLE[cyclePosition];

        // 檢查是否為週二
        const isTuesday = targetDate.getDay() === 2;
        return isTuesday && shift === '大休';
    };

    // 獲取當日大休的班級
    const getBigRestTeam = () => {
        for (const team of Object.keys(TEAMS)) {
            const shift = getShiftForDate(new Date(date), team);
            if (shift === '大休') {
                return team;
            }
        }
        return null;
    };

    // 檢查是否為循環中的第一天
    const isFirstDayOfShift = (team: string, shift: ShiftType) => {
        const startDate = new Date(2025, 3, 1);
        const targetDate = new Date(date);
        const daysDiff = Math.floor((targetDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

        const startPos = TEAM_START_POSITIONS[team];
        const cyclePosition = ((startPos - 1 + daysDiff) % 8 + 8) % 8;
        const currentShift = SHIFT_CYCLE[cyclePosition];

        // 如果是早班或中班，檢查是否為循環中的第一天
        if (currentShift === shift) {
            return cyclePosition === 0 || cyclePosition === 2; // 0是早班第一天，2是中班第一天
        }
        return false;
    };

    // 當選擇的成員改變時，更新時間選項
    useEffect(() => {
        if (selectedMember && selectedPeriod === 'custom') {
            const team = getMemberTeam(selectedMember);
            if (team) {
                const shift = getShiftForDate(new Date(date), team);
                const times = generateTimeOptions(shift);
                setTimeOptions(times);
                setEndTimeOptions(times.slice(1));
            }
        }
    }, [selectedMember, selectedPeriod, date]);

    // 當開始時間改變時，更新結束時間選項
    useEffect(() => {
        if (!customStartTime) {
            setEndTimeOptions(timeOptions);
            return;
        }

        // 過濾出晚於開始時間的選項（至少30分鐘）
        const filteredOptions = timeOptions.filter(time => {
            const startTimeInt = parseInt(customStartTime);
            const currentTimeInt = parseInt(time);

            // 將時間轉換為分鐘以便比較
            const startMinutes = Math.floor(startTimeInt / 100) * 60 + (startTimeInt % 100);
            let currentMinutes = Math.floor(currentTimeInt / 100) * 60 + (currentTimeInt % 100);

            // 處理跨日的情況
            if (currentTimeInt < startTimeInt) {
                // 如果當前時間小於開始時間，表示已經跨日
                // 例如：開始時間是 2315，當前時間是 0015
                currentMinutes += 24 * 60;  // 加上24小時的分鐘數
            }

            // 確保時間間隔至少30分鐘
            return currentMinutes >= startMinutes + 30;
        });

        console.log('Start time:', customStartTime);
        console.log('Filtered end time options:', filteredOptions);
        setEndTimeOptions(filteredOptions);

        // 如果當前選擇的結束時間不在新的選項中，清除結束時間
        if (!filteredOptions.includes(customEndTime)) {
            setCustomEndTime('');
        }
    }, [customStartTime, timeOptions, customEndTime]);

    // 獲取當前班別的時間範圍
    const getCurrentShiftTimeRange = () => {
        if (!selectedMember) return null;

        const memberTeam = getMemberTeam(selectedMember);
        if (!memberTeam) return null;

        const shift = getTeamShift(memberTeam, date);
        if (!shift) return null;

        console.log('Getting time range for shift:', shift);
        const timeRange = SHIFT_TIME_RANGES[shift as keyof typeof SHIFT_TIME_RANGES];
        console.log('Time range:', timeRange);

        return timeRange;
    };

    // 處理時間確認
    const handleConfirmTime = () => {
        if (!customStartTime || !customEndTime) {
            alert('請選擇開始和結束時間');
            return;
        }
        setConfirmedStartTime(customStartTime);
        setConfirmedEndTime(customEndTime);
    };

    // 處理提交請假
    const handleSubmit = async () => {
        if (!selectedTeam || !selectedMember) {
            alert('請選擇班級和人員');
            return;
        }

        if (selectedPeriod === 'custom') {
            if (!customStartTime || !customEndTime) {
                alert('請選擇請假時段');
                return;
            }

            // 檢查時間順序
            if (!isValidTimeOrder(customStartTime, customEndTime)) {
                alert('時段選取錯誤：開始時間不得晚於結束時間');
                // 清空時段選擇
                setCustomStartTime('');
                setCustomEndTime('');
                setConfirmedStartTime('');
                setConfirmedEndTime('');
                return;
            }
        }

        // 如果是全天請假且選擇了加班類型為 "全天"，檢查是否選擇了加班人員
        if (selectedPeriod === 'fullDay' && selectedOvertimeType === '全天') {
            if (!selectedOvertimeMember || !bigRestTeam) {
                alert('請選擇加班人員');
                return;
            }
            // 檢查選擇的加班人員是否屬於大休班級
            const isBigRestMember = TEAMS[bigRestTeam].members.some(member => member.name === selectedOvertimeMember);
            if (!isBigRestMember) {
                alert('加班人員必須是大休班級的人員');
                return;
            }
        }

        try {
            setIsSubmitting(true);
            const payload = {
                date,
                name: selectedMember,
                team: selectedTeam,
                period: selectedPeriod === 'custom' ? {
                    type: 'custom',
                    startTime: customStartTime,
                    endTime: customEndTime
                } : 'fullDay',
                // 如果是全天請假，提供默認的overtime
                overtime: selectedPeriod === 'fullDay' ? {
                    type: selectedOvertimeType === '全天' ? '全天' : '半天',
                    name: selectedOvertimeType === '全天' ? selectedOvertimeMember : '',
                    team: selectedOvertimeType === '全天' ? bigRestTeam : '',
                    confirmed: false,
                    firstConfirmed: false,
                    secondMember: {
                        name: '',
                        team: '',
                        confirmed: false
                    }
                } : undefined,
                // 如果是自定義時段，提供默認的customOvertime
                customOvertime: selectedPeriod === 'custom' ? {
                    name: '',
                    team: '',
                    startTime: '',
                    endTime: '',
                    confirmed: false
                } : undefined
            };

            const response = await fetch('/api/leave', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                throw new Error('Failed to submit leave request');
            }

            alert('請假申請已提交');

            // 清空表單
            setSelectedTeam('');
            setSelectedMember('');
            setSelectedPeriod('fullDay');
            setCustomStartTime('');
            setCustomEndTime('');
            setConfirmedStartTime('');
            setConfirmedEndTime('');
            setSelectedOvertimeMember('');
            setSelectedOvertimeType('');

            // 重新獲取請假記錄
            fetchLeaveRecords();
        } catch (error) {
            console.error('Error submitting leave request:', error);
            alert('提交請假申請失敗，請稍後再試');
        } finally {
            setIsSubmitting(false);
        }
    };

    // 更新加班類型
    const handleUpdateOvertimeType = async (record: LeaveRecordType, type: 'bigRest' | 'regular') => {
        try {
            const overtime = {
                type: type,
                name: record.overtime?.name || '',
                team: record.overtime?.team || '',
                confirmed: false,
                firstConfirmed: false,
                secondMember: type === 'regular' ? {
                    name: '',
                    team: '',
                    confirmed: false
                } : null
            };

            const response = await fetch(`/api/leave`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    ...record,
                    overtime
                }),
            });

            if (!response.ok) {
                throw new Error('Failed to update overtime type');
            }

            // 重新獲取請假記錄
            await fetchLeaveRecords();
        } catch (error) {
            console.error('Error updating overtime type:', error);
            alert('更新加班類型失敗');
        }
    };

    // 更新加班確認狀態
    const handleUpdateOvertimeConfirm = async (record: LeaveRecordType, isFirstMember: boolean) => {
        try {
            if (!record.overtime) return;

            const currentOvertime = record.overtime;
            const isFullDay = currentOvertime.type === '全天';

            // 如果是加整班，使用 confirmed 字段
            if (isFullDay) {
                if (currentOvertime.confirmed) {
                    if (!confirm(`確定要取消加班嗎？`)) {
                        return;
                    }
                }

                const updatedOvertime = {
                    ...currentOvertime,
                    confirmed: !currentOvertime.confirmed
                };

                if (updatedOvertime.confirmed === false) {
                    updatedOvertime.name = '';
                    updatedOvertime.team = '';
                }

                const response = await fetch('/api/leave', {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        date: record.date,
                        name: record.name,
                        overtime: updatedOvertime
                    }),
                });

                if (!response.ok) {
                    throw new Error('Failed to update leave record');
                }

                const updatedRecord = await response.json();
                setLeaveRecords(prevRecords =>
                    prevRecords.map(r =>
                        r._id === updatedRecord._id ? updatedRecord : r
                    )
                );
                return;
            }

            // 如果是加一半，使用 firstConfirmed 和 secondMember.confirmed
            if ((isFirstMember && currentOvertime.firstConfirmed) ||
                (!isFirstMember && currentOvertime.secondMember?.confirmed)) {
                if (!confirm(`確定要取消加班嗎？`)) {
                    return;
                }
            }

            const updatedOvertime = {
                ...currentOvertime,
                firstConfirmed: isFirstMember ? !currentOvertime.firstConfirmed : currentOvertime.firstConfirmed,
                secondMember: {
                    ...currentOvertime.secondMember,
                    confirmed: isFirstMember ? currentOvertime.secondMember?.confirmed : !currentOvertime.secondMember?.confirmed
                }
            };

            if ((isFirstMember && currentOvertime.firstConfirmed) ||
                (!isFirstMember && currentOvertime.secondMember?.confirmed)) {
                if (isFirstMember) {
                    updatedOvertime.name = '';
                    updatedOvertime.team = '';
                } else {
                    updatedOvertime.secondMember = {
                        ...currentOvertime.secondMember,
                        name: '',
                        team: '',
                        confirmed: false
                    };
                }
            }

            const response = await fetch('/api/leave', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    date: record.date,
                    name: record.name,
                    overtime: updatedOvertime
                }),
            });

            if (!response.ok) {
                throw new Error('Failed to update leave record');
            }

            const updatedRecord = await response.json();
            setLeaveRecords(prevRecords =>
                prevRecords.map(r =>
                    r._id === updatedRecord._id ? updatedRecord : r
                )
            );
        } catch (error) {
            console.error('Error updating leave record:', error);
            setError('更新請假記錄失敗');
        }
    };

    // 更新加班人員
    const handleUpdateOvertime = async (record: LeaveRecordType, newOvertimeMember: string | undefined) => {
        try {
            let updatedOvertime = {
                type: record.overtime?.type || 'regular',
                name: newOvertimeMember || '',
                team: newOvertimeMember ? getMemberTeam(newOvertimeMember) : '',
                confirmed: false,
                firstConfirmed: false,
                secondMember: record.overtime?.secondMember
            };

            const response = await fetch(`/api/leave`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    ...record,
                    overtime: updatedOvertime
                }),
            });

            if (!response.ok) {
                throw new Error('Failed to update overtime member');
            }

            // 重新獲取請假記錄
            await fetchLeaveRecords();
        } catch (error) {
            console.error('Error updating overtime member:', error);
            alert('更新加班人員失敗');
        }
    };

    // 更新第二位加班人員
    const handleUpdateSecondOvertime = async (record: LeaveRecordType, newSecondMember: string | undefined) => {
        try {
            if (!record.overtime) return;

            let updatedSecondMember = undefined;
            if (newSecondMember) {
                updatedSecondMember = {
                    name: newSecondMember,
                    team: getMemberTeam(newSecondMember),
                    confirmed: false
                };
            } else {
                updatedSecondMember = {
                    name: '',
                    team: '',
                    confirmed: false
                };
            }

            const response = await fetch(`/api/leave`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    ...record,
                    overtime: {
                        ...record.overtime,
                        type: record.overtime.type,
                        secondMember: updatedSecondMember
                    }
                }),
            });

            if (!response.ok) {
                throw new Error('Failed to update overtime member');
            }

            // 重新獲取請假記錄
            await fetchLeaveRecords();
        } catch (error) {
            console.error('Error updating second overtime member:', error);
            alert('更新第二加班人員失敗');
        }
    };

    // 更新請假確認狀態
    const handleUpdateLeaveConfirm = async (record: LeaveRecordType) => {
        try {
            const response = await fetch('/api/leave', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    date: record.date,
                    name: record.name,
                    confirmed: !record.confirmed
                }),
            });

            if (!response.ok) throw new Error('Failed to update leave confirmation');

            await fetchLeaveRecords();
        } catch (error) {
            console.error('Error updating leave confirmation:', error);
            alert('更新請假確認狀態失敗，請稍後再試');
        }
    };

    // 刪除請假記錄
    const handleDelete = async (record: LeaveRecordType) => {
        if (!window.confirm('確定要刪除這筆請假記錄嗎？')) {
            return;
        }

        try {
            const response = await fetch(`/api/leave`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(record),
            });

            if (!response.ok) {
                throw new Error('Failed to delete leave record');
            }

            // 重新獲取請假記錄
            await fetchLeaveRecords();
        } catch (error) {
            console.error('Error deleting leave record:', error);
            alert('刪除請假記錄失敗');
        }
    };

    // 取消加班
    const handleCancelOvertime = async (record: LeaveRecordType) => {
        if (!confirm(`確定要取消加班嗎？`)) {
            return;
        }

        try {
            const response = await fetch('/api/leave', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    ...record,
                    customOvertime: {
                        name: '',
                        team: '',
                        startTime: '',
                        endTime: '',
                        confirmed: false
                    }
                }),
            });

            if (!response.ok) {
                throw new Error('Failed to cancel overtime');
            }

            await fetchLeaveRecords();
        } catch (error) {
            console.error('Error canceling overtime:', error);
            alert('取消加班失敗');
        }
    };

    const getAvailableMembers = (team: string | undefined): string[] => {
        if (!team || !(team in TEAMS)) return [];
        const teamData = TEAMS[team as keyof typeof TEAMS];
        if (!teamData) return [];

        // 過濾掉已請假的人員
        const leaveMembers = leaveRecords.map(record => record.name);
        return teamData.members
            .filter(member => !leaveMembers.includes(member.name))
            .map(member => member.name);
    };

    // 取得當前班別的所有成員
    const getTeamMembers = (record: LeaveRecordType) => {
        const team = getMemberTeam(record.name);
        if (!team) return [];
        const teamData = TEAMS[team];
        if (!teamData) return [];
        return teamData.members.map(m => m.name).filter(name => name !== record.name);
    };

    // 獲取加班建議班級
    const getOvertimeSuggestions = (team: string) => {
        if (!team) return { first: '', second: '' };

        const shift = getTeamShift(team, date);
        if (!shift) return { first: '', second: '' };

        let firstSuggestion = '';
        let secondSuggestion = '';

        // 檢查當天是否有大休的班級
        let bigRestTeam = null;
        for (const [teamKey, teamData] of Object.entries(TEAMS)) {
            const teamShift = getShiftForDate(new Date(date), teamKey);
            if (teamShift === '大休') {
                bigRestTeam = teamKey;
                break;
            }
        }

        if (bigRestTeam) {
            return { first: bigRestTeam, second: '' };
        }

        switch (shift) {
            case '早班':
                // 前一天的中班
                firstSuggestion = getTeamByShift('中班', true, date);
                // 當天的中班
                secondSuggestion = getTeamByShift('中班', false, date);
                break;
            case '中班':
                // 當天的早班
                firstSuggestion = getTeamByShift('早班', true, date);
                // 當天的夜班
                secondSuggestion = getTeamByShift('夜班', false, date);
                break;
            case '夜班':
                // 當天的中班
                firstSuggestion = getTeamByShift('中班', true, date);
                // 當天的早班
                secondSuggestion = getTeamByShift('早班', false, date);
                break;
        }

        return { first: firstSuggestion, second: secondSuggestion };
    };

    // 獲取可選擇的加班人員
    const getAvailableOvertimeMembers = (record: LeaveRecordType) => {
        const memberRole = getMemberRole(record.name);
        const memberTeam = getMemberTeam(record.name);
        const allMembers = Object.entries(TEAMS).flatMap(([team, teamData]) =>
            teamData.members.map(member => ({
                name: member.name,
                team,
                role: member.role
            }))
        );

        // 過濾掉請假人員和同班的人員
        const availableMembers = allMembers.filter(member =>
            member.name !== record.name && member.team !== memberTeam
        );

        // 根據請假人員的角色過濾加班人員
        if (memberRole === '班長') {
            // 班長請假，只能由其他班級的班長加班
            return availableMembers.filter(member => member.role === '班長');
        } else {
            // 班員請假，可以由其他班級的班長或班員加班
            return availableMembers;
        }
    };

    // 獲取自定義時段的加班建議
    const getCustomOvertimeSuggestions = (startTime: string, endTime: string, team: string) => {
        if (!team) return { suggestion: '', reason: '' };

        const shift = getTeamShift(team, date);
        if (!shift) return { suggestion: '', reason: '' };

        const startTimeInt = parseInt(startTime);
        const endTimeInt = parseInt(endTime);

        // 獲取上一班和下一班的班級
        const previousShiftTeam = getTeamByShift(getPreviousShift(shift), true, date);
        const nextShiftTeam = getTeamByShift(getNextShift(shift), false, date);

        // 檢查是否與上一班結束時間重疊
        const previousShiftEndTime = getShiftEndTime(getPreviousShift(shift));
        if (startTimeInt === previousShiftEndTime) {
            return {
                suggestion: previousShiftTeam,
                reason: `因請假起始時間(${formatTimeDisplay(startTime)})與上一班結束時間相同，建議由前一天${previousShiftTeam}班加班`
            };
        }

        // 檢查是否與下一班開始時間重疊
        const nextShiftStartTime = getShiftStartTime(getNextShift(shift));
        if (endTimeInt === nextShiftStartTime) {
            return {
                suggestion: nextShiftTeam,
                reason: `因請假結束時間(${formatTimeDisplay(endTime)})與下一班開始時間相同，建議由當天${nextShiftTeam}班加班`
            };
        }

        return { suggestion: '', reason: '無加班建議' };
    };

    const getSuggestions = (type: string, record: LeaveRecord) => {
        if (type === "全天" && record.team && record.name) {
            const memberRole = getMemberRole(record.name);
            if (memberRole) {
                const bigRestTeams = findBigRestMembers(record.team, memberRole, date);
                if (bigRestTeams.length > 0) {
                    return {
                        suggestion: bigRestTeams.join(", "),
                        reason: '加班建議：' + bigRestTeams.join(", ") + '大休 '
                    };
                }
            }
        }
        return { suggestion: '', reason: '無加班建議' };
    };

    // Update suggestions when overtime type changes
    useEffect(() => {
        if (!selectedOvertimeType) return;
        const currentRecord = leaveRecords.find(record => record.period === 'fullDay');
        if (currentRecord) {
            const result = getSuggestions(selectedOvertimeType, currentRecord);
            setOvertimeSuggestions(result);
        }
    }, [selectedOvertimeType, leaveRecords]);

    // 獲取半天加班建議
    const getHalfDayOvertimeSuggestions = (team: string | undefined, date: string): { firstHalf: string; secondHalf: string } => {
        if (!team) return { firstHalf: '', secondHalf: '' };

        const shift = getTeamShift(team, date);
        if (!shift || shift === '小休' || shift === '大休') return { firstHalf: '', secondHalf: '' };

        const isFirst = isFirstDayOfShift(team, shift);

        const getCurrentTeam = (targetShift: ShiftType) => getTeamByShift(targetShift, false, date);
        const getPreviousTeam = (targetShift: ShiftType) => getTeamByShift(targetShift, true, date);
        const getRestTeam = (restType: '小休' | '大休') => {
            for (const t of Object.keys(TEAMS)) {
                if (getTeamShift(t, date) === restType) {
                    return t;
                }
            }
            return '';
        };

        const todayZhong = getCurrentTeam('中班');
        const todayYe = getCurrentTeam('夜班');
        const todayZao = getCurrentTeam('早班');
        const todayXiaoXiu = getRestTeam('小休');
        const prevZao = getPreviousTeam('早班');
        const prevZhong = getPreviousTeam('中班');

        let firstHalfSuggestion = '';
        let secondHalfSuggestion = '';

        switch (shift) {
            case '早班':
                firstHalfSuggestion = todayZhong;
                secondHalfSuggestion = isFirst ? todayXiaoXiu : todayYe;
                break;
            case '中班':
                firstHalfSuggestion = todayZao;
                secondHalfSuggestion = isFirst ? todayXiaoXiu : todayYe;
                break;
            case '夜班':
                firstHalfSuggestion = prevZao;
                secondHalfSuggestion = prevZhong;
                break;
        }

        return {
            firstHalf: firstHalfSuggestion ? `${firstHalfSuggestion}班` : '無建議',
            secondHalf: secondHalfSuggestion ? `${secondHalfSuggestion}班` : '無建議'
        };
    };

    const renderLeaveRecords = () => {
        if (!Array.isArray(leaveRecords) || leaveRecords.length === 0) {
            return null;
        }

        const bigRestTeam = getBigRestTeam();

        return (
            <div className="mt-8">
                <h2 className="text-lg font-semibold text-gray-800 mb-4">當日請假記錄</h2>
                <div className="space-y-4">
                    {leaveRecords.map((record, index) => {
                        if (!record) return null;
                        const team = getMemberTeam(record.name) || undefined;
                        const memberRole = team ? getMemberRole(record.name) : undefined;
                        const bgColorClass = memberRole === '班長' ? 'bg-red-50 border-red-200' : 'bg-blue-50 border-blue-200';

                        return (
                            <div key={index} className="flex gap-4">
                                <div className={`flex-1 ${bgColorClass} rounded-md p-4`}>
                                    <div className="space-y-2">
                                        <p className="text-gray-700">
                                            <span className="font-medium">請假人員：</span>
                                            {record.name} ({memberRole || '未知'})
                                        </p>
                                        <p className="text-gray-700">
                                            <span className="font-medium">所屬班級：</span>
                                            {team}
                                        </p>
                                        <p className="text-gray-700">
                                            <span className="font-medium">當天班別：</span>
                                            {team ? getTeamShift(team, date) || '未排班' : '未知'}
                                        </p>
                                        <p className="text-gray-700">
                                            <span className="font-medium">請假時段：</span>
                                            {record.period === 'fullDay' ? '一整天' :
                                                `${(record.period as CustomPeriod).startTime} - ${(record.period as CustomPeriod).endTime}`}
                                        </p>
                                        <div className="mt-2">
                                            <button
                                                onClick={() => handleDelete(record)}
                                                className="px-3 py-1 text-sm font-medium text-red-600 bg-red-50 border border-red-200 rounded-md hover:bg-red-100"
                                            >
                                                取消請假
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex-1 bg-green-50 border border-green-200 rounded-md p-4">
                                    {record.period === 'fullDay' && (
                                        <div className="space-y-4">
                                            <div className="space-y-2">
                                                <div className="space-y-2">
                                                    {bigRestTeam ? (
                                                        <div className="mb-2 p-2 bg-blue-50 rounded-md border border-blue-200">
                                                            <p className="text-sm text-blue-600 font-medium">加班建議：當日大休班級為{bigRestTeam}班</p>
                                                        </div>
                                                    ) : (
                                                        <div className="mb-2 p-2 bg-gray-50 rounded-md border border-gray-200">
                                                            <p className="text-sm text-gray-600 font-medium">加班建議：當日無大休班級</p>
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <select
                                                        value={selectedOvertimeType}
                                                        onChange={(e) => setSelectedOvertimeType(e.target.value)}
                                                        className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                                                        disabled={record.overtime?.confirmed ||
                                                            (record.overtime?.type === '半天' &&
                                                                record.overtime?.firstConfirmed &&
                                                                record.overtime?.secondMember?.confirmed)}
                                                    >
                                                        <option value="">請選擇加班類型</option>
                                                        {bigRestTeam && <option value="全天">加整班</option>}
                                                        <option value="半天">加一半</option>
                                                    </select>
                                                </div>
                                            </div>
                                            <div className="space-y-2">
                                                {selectedOvertimeType && selectedOvertimeType !== "全天" && (
                                                    <p className="text-sm text-gray-600">加班人員</p>
                                                )}
                                                {selectedOvertimeType === "全天" ? (
                                                    <div className="space-y-2">
                                                        <select
                                                            value={record.overtime?.name || selectedOvertimeMember}
                                                            onChange={(e) => {
                                                                setSelectedOvertimeMember(e.target.value);
                                                                handleOvertimeMemberChange(e, record);
                                                            }}
                                                            className="w-full text-sm rounded border border-green-200 focus:border-green-500 focus:ring-green-500"
                                                            disabled={record.overtime?.confirmed ||
                                                                (record.overtime?.type === '半天' &&
                                                                    record.overtime?.firstConfirmed &&
                                                                    record.overtime?.secondMember?.confirmed)}
                                                        >
                                                            <option value="">請選擇加班人員</option>
                                                            {Object.entries(TEAMS).flatMap(([team, teamData]) => {
                                                                const shift = getShiftForDate(new Date(date), team);
                                                                if (shift !== '大休') return [];

                                                                return teamData.members
                                                                    .filter(member => {
                                                                        if (member.name === record.name || team === record.team) {
                                                                            return false;
                                                                        }
                                                                        const leaveTakerRole = getMemberRole(record.name);
                                                                        if (leaveTakerRole === '班長') {
                                                                            return member.role === '班長';
                                                                        }
                                                                        return true;
                                                                    })
                                                                    .map(member => ({
                                                                        name: member.name,
                                                                        team,
                                                                        role: member.role
                                                                    }));
                                                            }).map((member) => {
                                                                const shift = getTeamShift(member.team, date);
                                                                return (
                                                                    <option key={member.name} value={member.name}>
                                                                        {member.name} {member.team} {shift} ({member.role})
                                                                    </option>
                                                                );
                                                            })}
                                                        </select>
                                                        {record.overtime?.confirmed ? (
                                                            <button
                                                                onClick={() => handleUpdateOvertimeConfirm(record, true)}
                                                                className="w-full px-3 py-1 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700"
                                                            >
                                                                取消加班
                                                            </button>
                                                        ) : (
                                                            <button
                                                                onClick={() => handleUpdateOvertimeConfirm(record, true)}
                                                                className="w-full px-3 py-1 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700"
                                                                disabled={!record.overtime?.name}
                                                            >
                                                                確認加班
                                                            </button>
                                                        )}
                                                    </div>
                                                ) : selectedOvertimeType === "半天" ? (
                                                    <div className="grid grid-cols-2 gap-4">
                                                        <div>
                                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                                加上半 <span className="text-xs text-blue-600"> (建議: {getHalfDayOvertimeSuggestions(team, date).firstHalf})</span>
                                                            </label>
                                                            <select
                                                                value={record.overtime?.name || ''}
                                                                onChange={(e) => handleOvertimeMemberChange(e, record, 'first')}
                                                                className="w-full text-sm rounded border border-green-200 focus:border-green-500 focus:ring-green-500"
                                                                disabled={record.overtime?.firstConfirmed}
                                                            >
                                                                <option value="">請選擇加班人員</option>
                                                                {Object.entries(TEAMS).flatMap(([team, teamData]) => {
                                                                    const leaveTakerRole = getMemberRole(record.name);
                                                                    return teamData.members
                                                                        .filter(member => {
                                                                            if (member.name === record.name || team === record.team) {
                                                                                return false;
                                                                            }
                                                                            if (leaveTakerRole === '班長') {
                                                                                return member.role === '班長';
                                                                            }
                                                                            return true;
                                                                        })
                                                                        .map(member => ({
                                                                            name: member.name,
                                                                            team,
                                                                            role: member.role
                                                                        }));
                                                                }).map((member) => {
                                                                    const shift = getTeamShift(member.team, date);
                                                                    return (
                                                                        <option key={member.name} value={member.name}>
                                                                            {member.name} {member.team} {shift} ({member.role})
                                                                        </option>
                                                                    );
                                                                })}
                                                            </select>
                                                            {record.overtime?.firstConfirmed ? (
                                                                <button
                                                                    onClick={() => handleUpdateOvertimeConfirm(record, true)}
                                                                    className="w-full mt-2 px-3 py-1 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700"
                                                                >
                                                                    取消加班
                                                                </button>
                                                            ) : (
                                                                <button
                                                                    onClick={() => handleUpdateOvertimeConfirm(record, true)}
                                                                    className="w-full mt-2 px-3 py-1 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700"
                                                                    disabled={!record.overtime?.name}
                                                                >
                                                                    確認加班
                                                                </button>
                                                            )}
                                                        </div>
                                                        <div>
                                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                                加下半 <span className="text-xs text-blue-600"> (建議: {getHalfDayOvertimeSuggestions(team, date).secondHalf})</span>
                                                            </label>
                                                            <select
                                                                value={record.overtime?.secondMember?.name || ''}
                                                                onChange={(e) => handleOvertimeMemberChange(e, record, 'second')}
                                                                className="w-full text-sm rounded border border-green-200 focus:border-green-500 focus:ring-green-500"
                                                                disabled={record.overtime?.secondMember?.confirmed}
                                                            >
                                                                <option value="">請選擇加班人員</option>
                                                                {Object.entries(TEAMS).flatMap(([team, teamData]) => {
                                                                    const leaveTakerRole = getMemberRole(record.name);
                                                                    return teamData.members
                                                                        .filter(member => {
                                                                            if (member.name === record.name || team === record.team) {
                                                                                return false;
                                                                            }
                                                                            if (leaveTakerRole === '班長') {
                                                                                return member.role === '班長';
                                                                            }
                                                                            return true;
                                                                        })
                                                                        .map(member => ({
                                                                            name: member.name,
                                                                            team,
                                                                            role: member.role
                                                                        }));
                                                                }).map((member) => {
                                                                    const shift = getTeamShift(member.team, date);
                                                                    return (
                                                                        <option key={member.name} value={member.name}>
                                                                            {member.name} {member.team} {shift} ({member.role})
                                                                        </option>
                                                                    );
                                                                })}
                                                            </select>
                                                            {record.overtime?.secondMember?.confirmed ? (
                                                                <button
                                                                    onClick={() => handleUpdateOvertimeConfirm(record, false)}
                                                                    className="w-full mt-2 px-3 py-1 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700"
                                                                >
                                                                    取消加班
                                                                </button>
                                                            ) : (
                                                                <button
                                                                    onClick={() => handleUpdateOvertimeConfirm(record, false)}
                                                                    className="w-full mt-2 px-3 py-1 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700"
                                                                    disabled={!record.overtime?.secondMember?.name}
                                                                >
                                                                    確認加班
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                ) : null}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    const updateLeaveRecord = async (date: string, name: string, updateData: any) => {
        try {
            const response = await fetch('/api/leave', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    date,
                    name,
                    ...updateData
                }),
            });

            if (!response.ok) {
                throw new Error('Failed to update leave record');
            }

            return await response.json();
        } catch (error) {
            console.error('Error updating leave record:', error);
            return null;
        }
    };

    const handleOvertimeMemberChange = async (e: React.ChangeEvent<HTMLSelectElement>, record: LeaveRecordType, halfType?: 'first' | 'second') => {
        const selectedMember = e.target.value;
        if (!selectedMember) return;

        // 找出當天大休的班級
        let bigRestTeam = null;
        for (const [teamKey, teamData] of Object.entries(TEAMS)) {
            const shift = getShiftForDate(new Date(date), teamKey);
            if (shift === '大休') {
                bigRestTeam = teamKey;
                break;
            }
        }

        // 檢查選擇的成員是否屬於大休班級
        const memberTeam = getMemberTeam(selectedMember);
        if (selectedOvertimeType === "全天" && memberTeam !== bigRestTeam) {
            alert('只能選擇當天大休班級的成員');
            return;
        }

        try {
            const currentOvertime = record.overtime || {
                type: selectedOvertimeType,
                name: '',
                team: '',
                confirmed: false,
                firstConfirmed: false,
                secondMember: {
                    name: '',
                    team: '',
                    confirmed: false
                }
            };

            let updatedOvertime;
            if (selectedOvertimeType === "全天") {
                updatedOvertime = {
                    ...currentOvertime,
                    type: '全天',
                    name: selectedMember,
                    team: memberTeam,
                    confirmed: false
                };
            } else {
                updatedOvertime = {
                    ...currentOvertime,
                    type: '半天',
                    name: halfType === 'first' ? selectedMember : currentOvertime.name,
                    team: halfType === 'first' ? memberTeam : currentOvertime.team,
                    confirmed: false,
                    firstConfirmed: halfType === 'first' ? false : currentOvertime.firstConfirmed,
                    secondMember: {
                        name: halfType === 'second' ? selectedMember : (currentOvertime.secondMember?.name || ''),
                        team: halfType === 'second' ? memberTeam : (currentOvertime.secondMember?.team || ''),
                        confirmed: halfType === 'second' ? false : (currentOvertime.secondMember?.confirmed || false)
                    }
                };
            }

            const response = await fetch('/api/leave', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    date: record.date,
                    name: record.name,
                    overtime: updatedOvertime
                }),
            });

            if (!response.ok) {
                throw new Error('Failed to update leave record');
            }

            const updatedRecord = await response.json();
            setLeaveRecords(prevRecords =>
                prevRecords.map(r =>
                    r._id === updatedRecord._id ? updatedRecord : r
                )
            );
        } catch (error) {
            console.error('Error updating leave record:', error);
            setError('更新請假記錄失敗');
        }
    };

    return (
        <div className="container mx-auto px-4 py-8">
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-2xl font-bold text-gray-800">{formattedDate} 請假管理</h1>
                <button
                    onClick={() => router.push('/')}
                    className="px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-md hover:bg-blue-100"
                >
                    返回日曆
                </button>
            </div>

            <div className="bg-white rounded-lg shadow-md p-6 mb-8">
                <h2 className="text-lg font-semibold text-gray-800 mb-4">新增請假</h2>
                <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">班級</label>
                            <select
                                value={selectedTeam}
                                onChange={(e) => {
                                    setSelectedTeam(e.target.value);
                                    setSelectedMember('');
                                }}
                                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                                disabled={isSubmitting}
                            >
                                <option value="">請選擇班級</option>
                                {teamOptions.map(option => (
                                    <option
                                        key={option.value}
                                        value={option.value}
                                        disabled={!option.canLeave}
                                    >
                                        {option.label}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">人員</label>
                            <select
                                value={selectedMember}
                                onChange={(e) => setSelectedMember(e.target.value)}
                                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                                disabled={!selectedTeam || isSubmitting}
                            >
                                <option value="">請選擇人員</option>
                                {selectedTeam && TEAMS[selectedTeam]?.members.map(member => (
                                    <option
                                        key={member.name}
                                        value={member.name}
                                        disabled={!canTakeLeave(selectedTeam, member.name)}
                                    >
                                        {member.name} ({member.role})
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">請假時段</label>
                        <div className="flex items-center space-x-4">
                            <label className="inline-flex items-center">
                                <input
                                    type="radio"
                                    value="fullDay"
                                    checked={selectedPeriod === 'fullDay'}
                                    onChange={() => setSelectedPeriod('fullDay')}
                                    className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                                    disabled={isSubmitting}
                                />
                                <span className="ml-2 text-sm text-gray-700">全天</span>
                            </label>
                            <label className="inline-flex items-center">
                                <input
                                    type="radio"
                                    value="custom"
                                    checked={selectedPeriod === 'custom'}
                                    onChange={() => setSelectedPeriod('custom')}
                                    className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                                    disabled={isSubmitting}
                                />
                                <span className="ml-2 text-sm text-gray-700">自定義時段</span>
                            </label>
                        </div>
                    </div>

                    {selectedPeriod === 'custom' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">開始時間</label>
                                <select
                                    value={customStartTime}
                                    onChange={(e) => setCustomStartTime(e.target.value)}
                                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                                    disabled={!selectedMember || isSubmitting}
                                >
                                    <option value="">請選擇開始時間</option>
                                    {timeOptions.map(time => (
                                        <option key={time} value={time}>
                                            {formatTimeDisplay(time)}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">結束時間</label>
                                <select
                                    value={customEndTime}
                                    onChange={(e) => setCustomEndTime(e.target.value)}
                                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                                    disabled={!customStartTime || isSubmitting}
                                >
                                    <option value="">請選擇結束時間</option>
                                    {endTimeOptions.map(time => (
                                        <option key={time} value={time}>
                                            {formatTimeDisplay(time)}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    )}

                    <div className="pt-4">
                        <button
                            onClick={handleSubmit}
                            disabled={
                                !selectedTeam ||
                                !selectedMember ||
                                (selectedPeriod === 'custom' && (!customStartTime || !customEndTime)) ||
                                isSubmitting
                            }
                            className="w-full px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed"
                        >
                            {isSubmitting ? '提交中...' : '提交請假'}
                        </button>
                    </div>
                </div>
            </div>

            {renderLeaveRecords()}
        </div>
    );
};

export default LeaveDatePage;