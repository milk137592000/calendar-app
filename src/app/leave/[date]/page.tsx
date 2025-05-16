'use client';

import React, { useState, useEffect, useRef } from 'react';
import { format, isAfter, isToday, startOfDay, parse, addMinutes } from 'date-fns';
import { useParams, useRouter } from 'next/navigation';
import { TEAMS } from '@/data/teams';
import { getShiftForDate, getMemberTeam, isTeamBigRestOnTuesday, findBigRestMembers, findRegularMembers, getMemberRole, TEAM_START_POSITIONS } from '@/utils/schedule';
import type { ShiftType } from '@/types/schedule';
import { LeaveRecord } from '@/models/LeaveRecord';
import type { TeamMember } from '@/data/teams';
import { OvertimeMember, FullDayOvertime } from '@/models/LeaveRecord';

// 8天循環的班別順序
const SHIFT_CYCLE: ShiftType[] = [
    '大休',          // 第1天
    '早班', '早班',   // 第2-3天
    '中班', '中班',   // 第4-5天
    '小休',          // 第6天
    '夜班', '夜班'    // 第7-8天
];

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

// Define member type
type TeamMemberType = {
    name: string;
    role: string;
}

type TeamsType = {
    [key: string]: {
        members: TeamMemberType[];
    };
}

// Define overtime types
type CustomPeriod = {
    type: 'custom';
    startTime: string;
    endTime: string;
};

type Period = 'fullDay' | CustomPeriod;

interface OvertimeMemberType {
    name: string;
    team: string;
    confirmed: boolean;
}

interface FullDayOvertimeType {
    type: '加整班' | '加一半';
    fullDayMember?: OvertimeMemberType;
    firstHalfMember?: OvertimeMemberType;
    secondHalfMember?: OvertimeMemberType;
    confirmed?: boolean;
}

interface CustomOvertimeType {
    type: '半天';
    name: string;
    team: string;
    startTime: string;
    endTime: string;
    member: OvertimeMemberType;
    confirmed: boolean;
}

interface LeaveRecordType {
    _id?: string;
    date: string;
    name: string;
    team?: string;
    period: Period;
    confirmed: boolean;
    fullDayOvertime?: {
        type: '加整班' | '加一半';
        confirmed: boolean;
        fullDayMember?: OvertimeMember;
        firstHalfMember?: OvertimeMember;
        secondHalfMember?: OvertimeMember;
    };
    customOvertime?: {
        name: string;
        team: string;
        startTime: string;
        endTime: string;
        confirmed: boolean;
    };
    createdAt?: string;
    updatedAt?: string;
}

// 格式化時間顯示
const formatTimeDisplay = (time: string) => {
    if (!time) return '';
    if (time === '2400') return '00:00';
    // 確保時間格式為 HH:mm
    const hours = time.slice(0, 2);
    const minutes = time.slice(2, 4);
    return `${hours}:${minutes}`;
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

// 在文件頂部添加類型定義
type OvertimeType = '加整班' | '加一半';

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
    const [overtimeStates, setOvertimeStates] = useState<{
        [key: string]: {
            selectedType: OvertimeType | '';
            selectedMember: string;
        };
    }>({});
    const [overtimeSuggestions, setOvertimeSuggestions] = useState({ suggestion: '', reason: '' });
    const [bigRestTeam, setBigRestTeam] = useState<string | null>(null);
    // 新增觸控滑動狀態
    const touchStartX = useRef<number | null>(null);
    const touchEndX = useRef<number | null>(null);
    const [expandedIndexes, setExpandedIndexes] = useState<{[key:number]: {leave: boolean, overtime: boolean}}>({});
    const [showLeaveForm, setShowLeaveForm] = useState(false);

    const toggleExpand = (index: number, type: 'leave' | 'overtime') => {
        setExpandedIndexes(prev => ({
            ...prev,
            [index]: {
                ...prev[index],
                [type]: !prev[index]?.[type]
            }
        }));
    };

    // 處理觸控開始
    const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
        touchStartX.current = e.touches[0].clientX;
    };
    // 處理觸控移動
    const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
        touchEndX.current = e.touches[0].clientX;
    };
    // 處理觸控結束
    const handleTouchEnd = () => {
        if (touchStartX.current === null || touchEndX.current === null) return;
        const diff = touchEndX.current - touchStartX.current;
        if (Math.abs(diff) > 50) {
            const current = new Date(date);
            if (diff < 0) {
                // 左滑，下一天
                const next = new Date(current);
                next.setDate(current.getDate() + 1);
                router.push(`/leave/${format(next, 'yyyy-MM-dd')}`);
            } else {
                // 右滑，前一天
                const prev = new Date(current);
                prev.setDate(current.getDate() - 1);
                router.push(`/leave/${format(prev, 'yyyy-MM-dd')}`);
            }
        }
        touchStartX.current = null;
        touchEndX.current = null;
    };

    // 獲取請假記錄
    const fetchLeaveRecords = async () => {
        try {
            console.log('正在獲取請假記錄，日期參數:', date);
            const response = await fetch(`/api/leave?date=${date}`);
            if (!response.ok) throw new Error('Failed to fetch leave records');
            const data = await response.json();
            console.log('獲取到的請假記錄:', data);

            if (!Array.isArray(data)) {
                console.error('API 返回的數據不是數組:', data);
                setLeaveRecords([]);
                setError('獲取請假記錄失敗：數據格式錯誤');
                return;
            }

            if (data.length === 0) {
                console.log('沒有請假記錄');
            }

            // 更新請假記錄，並同步更新 overtimeStates
            setLeaveRecords(data);

            // 初始化 overtimeStates，保存已有的加班信息
            const newOvertimeStates: {
                [key: string]: {
                    selectedType: OvertimeType | '';
                    selectedMember: string;
                };
            } = {};

            data.forEach((record: LeaveRecordType) => {
                if (record._id && record.fullDayOvertime) {
                    const { type, fullDayMember, firstHalfMember, secondHalfMember } = record.fullDayOvertime;

                    newOvertimeStates[record._id] = {
                        selectedType: type,
                        selectedMember: ''
                    };

                    if (type === '加整班' && fullDayMember) {
                        newOvertimeStates[record._id].selectedMember = fullDayMember.name;
                    } else if (type === '加一半') {
                        // 对于加一半，我们只在状态中记录已选择的加班类型，因为有两个人员
                        // 实际的人员信息在 UI 中直接从 record.fullDayOvertime 中读取
                    }
                }
            });

            setOvertimeStates(prev => ({
                ...prev,
                ...newOvertimeStates
            }));
        } catch (error) {
            console.error('Error fetching leave records:', error);
            setError('獲取請假記錄失敗');
        }
    };

    // FullDayOvertimeCard 組件 - 處理全天請假情況
    const FullDayOvertimeCard: React.FC<{ record: LeaveRecordType; selectClassName?: string }> = ({ record, selectClassName }) => {
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

        // 如果已經有確認的加班，顯示確認的加班資訊
        if (record.fullDayOvertime?.type === '加整班' && record.fullDayOvertime.fullDayMember?.confirmed) {
            return (
                <div className="space-y-4 p-4 bg-green-50 rounded-md border border-green-200">
                    <div className="p-3 bg-green-100 rounded-md">
                        <div className="flex justify-between items-center mb-2">
                            <span className="text-sm font-medium text-green-700">
                                加班類型：加整班
                            </span>
                            <span className="px-2 py-1 text-xs font-medium text-white bg-green-500 rounded-full">已確認</span>
                        </div>
                        <p className="text-sm text-green-700">
                            加班人員：{record.fullDayOvertime.fullDayMember.name} ({record.fullDayOvertime.fullDayMember.team}班)
                        </p>
                        <button
                            onClick={(e) => {e.stopPropagation(); handleCancelOvertime(record);}}
                            className="w-full mt-2 px-3 py-2 text-sm font-medium text-white bg-red-500 rounded-md hover:bg-red-600"
                        >
                            取消加班
                        </button>
                    </div>
                </div>
            );
        }

        // 如果已經有確認的加一半加班，顯示確認的加班資訊
        if (record.fullDayOvertime?.type === '加一半' &&
            (record.fullDayOvertime.firstHalfMember?.confirmed || record.fullDayOvertime.secondHalfMember?.confirmed)) {
            return (
                <div className="space-y-4 p-4 bg-green-50 rounded-md border border-green-200">
                    <div className="space-y-4">
                        {/* 前半加班資訊 */}
                        <div className="p-3 bg-green-100 rounded-md">
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-sm font-medium text-green-700">加前半</span>
                                {record.fullDayOvertime.firstHalfMember?.confirmed && (
                                    <span className="px-2 py-1 text-xs font-medium text-white bg-green-500 rounded-full">已確認</span>
                                )}
                            </div>
                            {record.fullDayOvertime.firstHalfMember?.confirmed ? (
                                <>
                                    <p className="text-sm text-green-700">
                                        加班人員：{record.fullDayOvertime.firstHalfMember.name} ({record.fullDayOvertime.firstHalfMember.team}班)
                                    </p>
                                    <button
                                        onClick={(e) => {e.stopPropagation(); handleCancelOvertime(record);}}
                                        className="w-full mt-2 px-3 py-2 text-sm font-medium text-white bg-red-500 rounded-md hover:bg-red-600"
                                    >
                                        取消前半加班
                                    </button>
                                </>
                            ) : (
                                <div className="flex flex-col gap-1">
                                    <select
                                        value={record.fullDayOvertime?.firstHalfMember?.name || ''}
                                        onChange={(e) => handleOvertimeMemberChange(record, e.target.value, 'first')}
                                        onClick={(e) => e.stopPropagation()}
                                        className={"w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 " + (selectClassName || "")}
                                        disabled={record.fullDayOvertime?.firstHalfMember?.confirmed}
                                    >
                                        <option value="">請選擇加前半人員</option>
                                        {(getAvailableOvertimeMembers(record, 'first') || []).map(member => (
                                            <option key={`${member.team}-${member.name}`} value={member.name}>
                                                {member.name} ({member.role}, {member.team}班)
                                            </option>
                                        ))}
                                    </select>
                                    
                                    {record.fullDayOvertime?.firstHalfMember?.name && !record.fullDayOvertime?.firstHalfMember?.confirmed && (
                                        <div className="flex flex-row gap-2 mt-2">
                                            <button
                                                onClick={() => handleUpdateOvertimeConfirm(record, true, "first")}
                                                className="w-full sm:w-auto px-2 py-1 text-xs font-medium text-white bg-green-500 rounded-md hover:bg-green-600 whitespace-nowrap"
                                            >
                                                確認前半加班
                                            </button>
                                            <button
                                                onClick={() => handleCancelOvertime(record)}
                                                className="w-full sm:w-auto px-2 py-1 text-xs font-medium text-white bg-red-500 rounded-md hover:bg-red-600 whitespace-nowrap"
                                            >
                                                取消加班
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* 後半加班資訊 */}
                        <div className="p-3 bg-green-100 rounded-md">
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-sm font-medium text-green-700">加後半</span>
                                {record.fullDayOvertime.secondHalfMember?.confirmed && (
                                    <span className="px-2 py-1 text-xs font-medium text-white bg-green-500 rounded-full">已確認</span>
                                )}
                            </div>
                            {record.fullDayOvertime.secondHalfMember?.confirmed ? (
                                <>
                                    <p className="text-sm text-green-700">
                                        加班人員：{record.fullDayOvertime.secondHalfMember.name} ({record.fullDayOvertime.secondHalfMember.team}班)
                                    </p>
                                    <button
                                        onClick={(e) => {e.stopPropagation(); handleCancelOvertime(record);}}
                                        className="w-full sm:w-auto mt-2 sm:mt-0 px-2 py-1 text-xs font-medium text-white bg-red-500 rounded-md hover:bg-red-600 whitespace-nowrap"
                                    >
                                        取消後半加班
                                    </button>
                                </>
                            ) : (
                                <div className="flex flex-col gap-1">
                                    <select
                                        value={record.fullDayOvertime?.secondHalfMember?.name || ''}
                                        onChange={(e) => handleOvertimeMemberChange(record, e.target.value, 'second')}
                                        onClick={(e) => e.stopPropagation()}
                                        className={"w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 " + (selectClassName || "")}
                                    >
                                        <option value="">請選擇加後半人員</option>
                                        {(getAvailableOvertimeMembers(record, 'second') || []).map(member => (
                                            <option key={`${member.team}-${member.name}`} value={member.name}>
                                                {member.name} ({member.role}, {member.team}班)
                                            </option>
                                        ))}
                                    </select>
                                    
                                    {record.fullDayOvertime?.secondHalfMember?.name && !record.fullDayOvertime?.secondHalfMember?.confirmed && (
                                        <div className="flex flex-row gap-2 mt-2">
                                            <button
                                                onClick={() => handleUpdateOvertimeConfirm(record, true, "second")}
                                                className="w-full sm:w-auto px-2 py-1 text-xs font-medium text-white bg-green-500 rounded-md hover:bg-green-600 whitespace-nowrap"
                                            >
                                                確認後半加班
                                            </button>
                                            <button
                                                onClick={() => handleCancelOvertime(record)}
                                                className="w-full sm:w-auto px-2 py-1 text-xs font-medium text-white bg-red-500 rounded-md hover:bg-red-600 whitespace-nowrap"
                                            >
                                                取消加班
                                            </button>
                                        </div>
                                    )}

                                    {record.fullDayOvertime?.secondHalfMember?.confirmed && (
                                        <button
                                            onClick={() => handleUpdateOvertimeConfirm(record, false, 'second')}
                                            className="w-full sm:w-auto mt-2 sm:mt-0 px-2 py-1 text-xs font-medium text-white bg-red-500 rounded-md hover:bg-red-600 whitespace-nowrap"
                                        >
                                            取消後半加班
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            );
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
                        {/* 加班選項 */}
                        <div className="space-y-4">
                            {/* 加班類型選擇 */}
                            <div className="flex items-center gap-2">
                                <select
                                    value={overtimeStates[record._id || '']?.selectedType || ''}
                                    onChange={(e) => {
                                        handleOvertimeTypeChange(record, e.target.value as OvertimeType);
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                    className={"flex-1 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 " + (selectClassName || "")}
                                    disabled={!!(record.fullDayOvertime?.fullDayMember?.confirmed ||
                                        (record.fullDayOvertime?.type === '加一半' &&
                                            record.fullDayOvertime?.firstHalfMember?.confirmed &&
                                            record.fullDayOvertime?.secondHalfMember?.confirmed))}
                                >
                                    <option value="">請選擇加班類型</option>
                                    {bigRestTeam && <option value="加整班">加整班</option>}
                                    <option value="加一半">加一半</option>
                                </select>
                            </div>

                            {/* 加班人員選擇 - 加整班 */}
                            {overtimeStates[record._id || '']?.selectedType === '加整班' && bigRestTeam && (
                                <div className="space-y-2">
                                    <div className="flex flex-col gap-1">
                                        <select
                                            value={overtimeStates[record._id || '']?.selectedMember || (record.fullDayOvertime?.fullDayMember ? record.fullDayOvertime.fullDayMember.name : '')}
                                            onChange={(e) => handleOvertimeMemberChange(record, e.target.value)}
                                            onClick={(e) => e.stopPropagation()}
                                            className={"w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 " + (selectClassName || "")}
                                            disabled={record.fullDayOvertime?.fullDayMember?.confirmed}
                                        >
                                            <option value="">請選擇加班人員</option>
                                            {(getAvailableOvertimeMembers(record) || []).map(member => (
                                                <option key={`${member.team}-${member.name}`} value={member.name}>
                                                    {member.name} ({member.role}, {member.team}班)
                                                </option>
                                            ))}
                                        </select>

                                        {(overtimeStates[record._id || '']?.selectedMember || record.fullDayOvertime?.fullDayMember?.name) && !record.fullDayOvertime?.fullDayMember?.confirmed && (
                                            <button
                                                onClick={() => handleUpdateOvertimeConfirm(record, true)}
                                                className="w-full sm:w-auto mt-2 sm:mt-0 px-2 py-1 text-xs font-medium text-white bg-green-500 rounded-md hover:bg-green-600 whitespace-nowrap"
                                            >
                                                確認加班
                                            </button>
                                        )}

                                        {record.fullDayOvertime?.fullDayMember?.confirmed && (
                                            <button
                                                onClick={() => handleUpdateOvertimeConfirm(record, false)}
                                                className="w-full sm:w-auto mt-2 sm:mt-0 px-2 py-1 text-xs font-medium text-white bg-red-500 rounded-md hover:bg-red-600 whitespace-nowrap"
                                            >
                                                取消加班
                                            </button>
                                        )}
                                    </div>
                                    {overtimeSuggestions.suggestion && (
                                        <div className="p-2 bg-blue-50 rounded-md border border-blue-200">
                                            <p className="text-sm text-blue-600 font-medium">{overtimeSuggestions.reason}</p>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* 加班人員選擇 - 加一半 */}
                            {overtimeStates[record._id || '']?.selectedType === '加一半' && (
                                <div className="space-y-4">
                                    {/* 前半加班人員 */}
                                    <div className="p-3 bg-green-50 rounded-md border border-green-200">
                                        {(() => {
                                            const team = getMemberTeam(record.name) || undefined;
                                            const suggestions = getHalfDayOvertimeSuggestions(team, date);
                                            return (
                                                <div className="mb-2">
                                                    <div className="mb-1 text-xs text-blue-700 font-semibold">加前半建議: {suggestions.firstHalf}</div>
                                                </div>
                                            );
                                        })()}
                                        <div className="flex justify-between items-center mb-2">
                                            <h4 className="text-sm font-medium text-green-700">加前半</h4>
                                            {record.fullDayOvertime?.firstHalfMember?.confirmed && (
                                                <span className="px-2 py-1 text-xs font-medium text-white bg-green-500 rounded-full">已確認</span>
                                            )}
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <select
                                                value={record.fullDayOvertime?.firstHalfMember?.name || ''}
                                                onChange={(e) => handleOvertimeMemberChange(record, e.target.value, 'first')}
                                                onClick={(e) => e.stopPropagation()}
                                                className={"w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 " + (selectClassName || "")}
                                                disabled={record.fullDayOvertime?.firstHalfMember?.confirmed}
                                            >
                                                <option value="">請選擇加前半人員</option>
                                                {(getAvailableOvertimeMembers(record, 'first') || []).map(member => (
                                                    <option key={`${member.team}-${member.name}`} value={member.name}>
                                                        {member.name} ({member.role}, {member.team}班)
                                                    </option>
                                                ))}
                                            </select>

                                            {record.fullDayOvertime?.firstHalfMember?.name && !record.fullDayOvertime?.firstHalfMember?.confirmed && (
                                                <div className="flex flex-row gap-2 mt-2">
                                                    <button
                                                        onClick={() => handleUpdateOvertimeConfirm(record, true, "first")}
                                                        className="w-full sm:w-auto px-2 py-1 text-xs font-medium text-white bg-green-500 rounded-md hover:bg-green-600 whitespace-nowrap"
                                                    >
                                                        確認前半加班
                                                    </button>
                                                    <button
                                                        onClick={() => handleCancelOvertime(record)}
                                                        className="w-full sm:w-auto px-2 py-1 text-xs font-medium text-white bg-red-500 rounded-md hover:bg-red-600 whitespace-nowrap"
                                                    >
                                                        取消加班
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* 後半加班人員 */}
                                    <div className="p-3 bg-green-50 rounded-md border border-green-200">
                                        {(() => {
                                            const team = getMemberTeam(record.name) || undefined;
                                            const suggestions = getHalfDayOvertimeSuggestions(team, date);
                                            return (
                                                <div className="mb-2">
                                                    <div className="mb-1 text-xs text-blue-700 font-semibold">加後半建議: {suggestions.secondHalf}</div>
                                                </div>
                                            );
                                        })()}
                                        <div className="flex justify-between items-center mb-2">
                                            <h4 className="text-sm font-medium text-green-700">加後半</h4>
                                            {record.fullDayOvertime?.secondHalfMember?.confirmed && (
                                                <span className="px-2 py-1 text-xs font-medium text-white bg-green-500 rounded-full">已確認</span>
                                            )}
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <select
                                                value={record.fullDayOvertime?.secondHalfMember?.name || ''}
                                                onChange={(e) => handleOvertimeMemberChange(record, e.target.value, 'second')}
                                                onClick={(e) => e.stopPropagation()}
                                                className={"w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 " + (selectClassName || "")}
                                                disabled={record.fullDayOvertime?.secondHalfMember?.confirmed}
                                            >
                                                <option value="">請選擇加後半人員</option>
                                                {(getAvailableOvertimeMembers(record, 'second') || []).map(member => (
                                                    <option key={`${member.team}-${member.name}`} value={member.name}>
                                                        {member.name} ({member.role}, {member.team}班)
                                                    </option>
                                                ))}
                                            </select>

                                            {record.fullDayOvertime?.secondHalfMember?.name && !record.fullDayOvertime?.secondHalfMember?.confirmed && (
                                                <div className="flex flex-row gap-2 mt-2">
                                                    <button
                                                        onClick={() => handleUpdateOvertimeConfirm(record, true, "second")}
                                                        className="w-full sm:w-auto px-2 py-1 text-xs font-medium text-white bg-green-500 rounded-md hover:bg-green-600 whitespace-nowrap"
                                                    >
                                                        確認後半加班
                                                    </button>
                                                    <button
                                                        onClick={() => handleCancelOvertime(record)}
                                                        className="w-full sm:w-auto px-2 py-1 text-xs font-medium text-white bg-red-500 rounded-md hover:bg-red-600 whitespace-nowrap"
                                                    >
                                                        取消加班
                                                    </button>
                                                </div>
                                            )}

                                            {record.fullDayOvertime?.secondHalfMember?.confirmed && (
                                                <button
                                                    onClick={() => handleUpdateOvertimeConfirm(record, false, 'second')}
                                                    className="w-full sm:w-auto mt-2 sm:mt-0 px-2 py-1 text-xs font-medium text-white bg-red-500 rounded-md hover:bg-red-600 whitespace-nowrap"
                                                >
                                                    取消後半加班
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            );
        }

        return (
            <div className="space-y-4 p-4 bg-green-50 rounded-md border border-green-200">
                <h3 className="text-green-800 font-medium">全天請假加班安排</h3>
                <div className="mt-2 space-y-2">
                    <p className="text-xs text-green-600 whitespace-nowrap">
                        加班人員: {customOvertime.name} ({customOvertime.team}班)
                    </p>
                    <p className="text-xs text-green-600 whitespace-nowrap">
                        加班時段: {overtimeStates[record._id || '']?.selectedType}
                    </p>
                </div>
            </div>
        );
    };

    // CustomOvertimeCard 組件 - 處理自定義時段請假情況
    const CustomOvertimeCard: React.FC<{ record: LeaveRecordType }> = ({ record }) => {
        const [selectedMember, setSelectedMember] = useState('');

        // 如果已經有加班記錄，顯示確認狀態
        const customOvertime = record.customOvertime;

        // 獲取當前請假人員的班別
        const leaveTeam = getMemberTeam(record.name);
        const leaveRole = getMemberRole(record.name);

        // 獲取可用的加班人員列表
        const candidates = Object.entries(TEAMS)
            .filter(([team]) => team !== leaveTeam)
            .flatMap(([team, data]) => data.members.map(m => ({ ...m, team })));

        // 班長請假，只能由其他班的班長加班
        const availableCandidates = leaveRole === '班長'
            ? candidates.filter(m => m.role === '班長')
            : candidates;

        // 處理加班人員選擇變更
        const handleMemberChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
            setSelectedMember(e.target.value);
        };

        // 處理確認加班
        const handleConfirmOvertime = async () => {
            if (!selectedMember) {
                alert('請選擇加班人員');
                return;
            }

            try {
                const selectedMemberData = availableCandidates.find(m => m.name === selectedMember);
                if (!selectedMemberData) {
                    alert('無法找到所選人員的資料');
                    return;
                }

                // 獲取自定義時段
                const customPeriod = record.period as CustomPeriod;

                const response = await fetch('/api/leave', {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        date: record.date,
                        name: record.name,
                        customOvertime: {
                            name: selectedMember,
                            team: selectedMemberData.team,
                            startTime: customPeriod.startTime,
                            endTime: customPeriod.endTime,
                            confirmed: true
                        }
                    }),
                });

                if (!response.ok) {
                    throw new Error('更新加班信息失敗');
                }

                // 重新獲取請假記錄
                await fetchLeaveRecords();
                setSelectedMember('');
            } catch (error) {
                console.error('Error confirming overtime:', error);
                alert('確認加班失敗');
            }
        };

        if (customOvertime && customOvertime.name) {
            return (
                <div className="space-y-2">
                    <h3 className="font-medium text-gray-800">加班資訊</h3>
                    <div className="bg-green-50 border border-green-200 rounded-md p-3">
                        <p className="text-gray-700">
                            <span className="font-medium">加班人員：</span>
                            {customOvertime.name} ({customOvertime.team}班)
                        </p>
                        <p className="text-gray-700">
                            <span className="font-medium">加班時段：</span>
                            {customOvertime.startTime} - {customOvertime.endTime}
                        </p>
                        <p className="text-gray-700">
                            <span className="font-medium">狀態：</span>
                            <span className={`${customOvertime.confirmed ? 'text-green-600' : 'text-amber-600'} font-medium`}>
                                {customOvertime.confirmed ? '已確認' : '待確認'}
                            </span>
                        </p>
                        {customOvertime.confirmed && (
                            <button
                                onClick={() => handleCancelOvertime(record)}
                                className="mt-2 w-full px-3 py-1 text-sm font-medium text-white bg-red-500 rounded-md hover:bg-red-600"
                            >
                                取消加班
                            </button>
                        )}
                    </div>
                </div>
            );
        }

        return (
            <div className="space-y-2">
                <h3 className="font-medium text-gray-800">自定義時段</h3>
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
                    <div className="space-y-4">
                        {/* 加班人員選擇 */}
                        <div>
                            <label htmlFor="overtimeMember" className="block text-sm font-medium text-gray-700 mb-1">
                                加班人員
                            </label>
                            <select
                                id="overtimeMember"
                                value={selectedMember}
                                onChange={handleMemberChange}
                                onClick={(e) => e.stopPropagation()}
                                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                            >
                                <option value="">請選擇加班人員</option>
                                {availableCandidates.map(member => (
                                    <option key={`${member.team}-${member.name}`} value={member.name}>
                                        {member.name} ({member.role}, {member.team}班)
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* 加班時段顯示 */}
                        <div>
                            <p className="text-xs text-gray-700 whitespace-nowrap">
                                <span className="font-medium">加班時段：</span>
                                {typeof record.period === 'object' && record.period.type === 'custom'
                                    ? `${record.period.startTime} - ${record.period.endTime}`
                                    : '未定義時段'}
                            </p>
                        </div>

                        {/* 建議加班人員提示 */}
                        {typeof record.period === 'object' && record.period.type === 'custom' && record.team && (
                            <div className="p-2 bg-blue-50 rounded-md border border-blue-200">
                                {(() => {
                                    const suggestion = getCustomOvertimeSuggestions(
                                        record.period.startTime,
                                        record.period.endTime,
                                        record.team
                                    );
                                    return suggestion.reason ? (
                                        <p className="text-sm text-blue-600 font-medium">{suggestion.reason}</p>
                                    ) : (
                                        <p className="text-sm text-blue-600 font-medium">無特定加班建議</p>
                                    );
                                })()}
                            </div>
                        )}

                        {/* 確認按鈕 */}
                        <button
                            onClick={handleConfirmOvertime}
                            disabled={!selectedMember}
                            className={`w-full px-3 py-2 text-sm font-medium text-white rounded-md
                                ${selectedMember ? 'bg-blue-500 hover:bg-blue-600' : 'bg-gray-300 cursor-not-allowed'}`}
                        >
                            確認加班
                        </button>
                    </div>
                </div>
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

    // 在组件加载和日期改变时确定当天大休的班级
    useEffect(() => {
        // 查找当天大休的班级
        const currentBigRestTeam = getBigRestTeam();
        console.log('当天大休班级:', currentBigRestTeam);
        setBigRestTeam(currentBigRestTeam);
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
        // 允許今天和未來請假
        if (!isTodayOrFuture()) {
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

        setIsSubmitting(true);

        try {
            const payload = {
                date,
                name: selectedMember,
                team: selectedTeam,
                period: selectedPeriod === 'custom' ? {
                    type: 'custom',
                    startTime: formatTimeDisplay(customStartTime),
                    endTime: formatTimeDisplay(customEndTime)
                } : 'fullDay'
            };

            console.log('提交請假數據:', payload);

            const response = await fetch('/api/leave', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const errorData = await response.json();
                console.error('請假申請失敗:', errorData);
                throw new Error(errorData.error || 'Failed to submit leave request');
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

            // 重新獲取請假記錄，包含加班資訊
            await fetchLeaveRecords();
        } catch (error) {
            console.error('Error submitting leave request:', error);
            alert(error instanceof Error ? error.message : '提交請假申請失敗，請稍後再試');
        } finally {
            setIsSubmitting(false);
        }
    };

    // 更新加班類型
    const handleOvertimeTypeChange = async (record: LeaveRecordType, type: OvertimeType | '') => {
        // 首先更新本地状态
        setOvertimeStates(prev => ({
            ...prev,
            [record._id || '']: {
                selectedType: type,
                selectedMember: ''
            }
        }));

        // 如果清除了加班类型，直接返回，不发送更新请求
        if (!type) return;

        // 只在"加整班"時等選人再送出，選"加一半"時不送出 PUT 請求
        // 原本這裡有自動送出 PUT 請求的邏輯，已移除
    };

    // 更新加班人員
    const handleOvertimeMemberChange = async (record: LeaveRecordType, memberName: string, halfType?: 'first' | 'second') => {
        const recordId = record._id || '';
        const currentState = overtimeStates[recordId] || { selectedType: '', selectedMember: '' };

        // 仅在"加整班"时更新selectedMember状态
        if (!halfType) {
            setOvertimeStates(prev => ({
                ...prev,
                [recordId]: {
                    ...currentState,
                    selectedMember: memberName
                }
            }));
        }

        // 新增：選擇人員後自動展開加班卡
        setExpandedIndexes(prev => ({
            ...prev,
            [leaveRecords.findIndex(r => r._id === record._id)]: {
                ...(prev[leaveRecords.findIndex(r => r._id === record._id)] || {}),
                overtime: true
            }
        }));

        if (!memberName || !record.date || !record.name) {
            console.log('Missing required data:', { memberName, date: record.date, name: record.name });
            return;
        }

        const memberTeam = getMemberTeam(memberName);
        const bigRestTeam = getBigRestTeam();
        if (!memberTeam) {
            console.error('Could not find team for member:', memberName);
            return;
        }

        const overtimeMember: OvertimeMemberType = {
            name: memberName,
            team: (currentState.selectedType === '加整班' && bigRestTeam) ? bigRestTeam : memberTeam,
            confirmed: false
        };

        // 構建加班資料
        let overtimeData: FullDayOvertimeType;
        if (halfType) {
            // 加一半：保留另一半的資料
            overtimeData = {
                type: '加一半',
                ...(record.fullDayOvertime || {}),  // 保留現有資料
                [halfType === 'first' ? 'firstHalfMember' : 'secondHalfMember']: overtimeMember
            };
        } else {
            // 加整班
            overtimeData = {
                type: '加整班',
                fullDayMember: overtimeMember
            };
        }

        try {
            const response = await fetch('/api/leave', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    date: record.date,
                    name: record.name,
                    fullDayOvertime: overtimeData
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to update overtime');
            }

            await fetchLeaveRecords();
        } catch (error) {
            console.error('Error updating overtime:', error);
            alert('更新加班資訊失敗：' + (error instanceof Error ? error.message : '未知錯誤'));
        }
    };

    // 更新加班確認狀態
    const handleUpdateOvertimeConfirm = async (record: LeaveRecordType, confirm: boolean, halfType?: 'first' | 'second') => {
        if (!record.fullDayOvertime) {
            console.error('No overtime data found');
            return;
        }

        try {
            // 構建更新數據，取消確認時也清空人員資料
            let updateData: any = {
                date: record.date,
                name: record.name,
                confirm,
                halfType
            };

            // 如果是取消確認，同時清空相應的人員資料
            if (!confirm && record.fullDayOvertime.type === '加一半') {
                updateData.clearMember = true; // 標記需要清空人員資料
            }

            const response = await fetch('/api/leave', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(updateData),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to update overtime confirmation');
            }

            await fetchLeaveRecords();
        } catch (error) {
            console.error('Error updating overtime confirmation:', error);
            alert('更新加班確認狀態失敗：' + (error instanceof Error ? error.message : '未知錯誤'));
        }
    };

    // 取消加班
    const handleCancelOvertime = async (record: LeaveRecordType) => {
        if (!confirm(`確定要取消加班嗎？`)) {
            return;
        }

        try {
            let requestBody: {
                date: string;
                name: string;
                customOvertime?: {
                    name: string;
                    team: string;
                    startTime: string;
                    endTime: string;
                    confirmed: boolean;
                };
                fullDayOvertime?: {
                    type: string;
                    fullDayMember?: undefined;
                    firstHalfMember?: undefined;
                    secondHalfMember?: undefined;
                };
                clearOvertime?: boolean;
            } = {
                date: record.date,
                name: record.name,
                clearOvertime: true  // 明確告知後端這是取消加班的請求
            };

            // 如果是自定義時段加班
            if (record.customOvertime) {
                requestBody.customOvertime = {
                    name: '',
                    team: '',
                    startTime: '',
                    endTime: '',
                    confirmed: false
                };
            } 
            // 如果是全天加班
            else if (record.fullDayOvertime) {
                requestBody.fullDayOvertime = {
                    type: '',
                    fullDayMember: undefined,
                    firstHalfMember: undefined,
                    secondHalfMember: undefined
                };
            }

            const response = await fetch('/api/leave', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to cancel overtime');
            }

            await fetchLeaveRecords();
        } catch (error) {
            console.error('Error canceling overtime:', error);
            alert('取消加班失敗：' + (error instanceof Error ? error.message : '未知錯誤'));
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

    // 根據 rule.md 加班限制，取得可選加班人員
    const getAvailableOvertimeMembers = (record: LeaveRecordType, halfType?: 'first' | 'second') => {
        const leaveMember = record.name;
        const leaveTeam = getMemberTeam(leaveMember);
        const leaveRole = getMemberRole(leaveMember);
        const bigRestTeam = getBigRestTeam();
        const selectedType = overtimeStates[record._id || '']?.selectedType;

        // 加整班時，只能選大休班級
        if (selectedType === '加整班' && bigRestTeam) {
            return TEAMS[bigRestTeam].members
                .map(m => ({ ...m, team: bigRestTeam }));
        }

        // 取得所有其他班的成員
        let candidates = Object.entries(TEAMS)
            .filter(([team]) => team !== leaveTeam)
            .flatMap(([team, data]) => data.members.map(m => ({ ...m, team })));

        // 班長請假，只能由其他班的班長加班
        if (leaveRole === '班長') {
            candidates = candidates.filter(m => m.role === '班長');
        }
        // 班員請假，其他班的班長班員都可以加班（不需要額外過濾）

        // 加一半時，前後半不得由同個班級加班，除非該班當日為大休或小休
        if (record.fullDayOvertime?.type === '加一半') {
            const first = record.fullDayOvertime.firstHalfMember;
            const second = record.fullDayOvertime.secondHalfMember;
            if (halfType === 'first' && second) {
                const secondTeamShift = getTeamShift(second.team, date);
                if (secondTeamShift !== '大休' && secondTeamShift !== '小休') {
                    candidates = candidates.filter(m => m.team !== second.team);
                }
            }
            if (halfType === 'second' && first) {
                const firstTeamShift = getTeamShift(first.team, date);
                if (firstTeamShift !== '大休' && firstTeamShift !== '小休') {
                    candidates = candidates.filter(m => m.team !== first.team);
                }
            }
        }

        // 檢查輪班順序限制，但小休班級不受此限制
        if (halfType) {
            const memberTeam = halfType === 'first' ? 
                record.fullDayOvertime?.firstHalfMember?.team :
                record.fullDayOvertime?.secondHalfMember?.team;
            
            if (memberTeam && memberTeam !== bigRestTeam) {
                const memberShift = getTeamShift(memberTeam, date);
                // 如果是小休班級，不受輪班順序限制
                if (memberShift !== '小休') {
                    if (memberShift === '夜班') {
                        // 若加班人員加當日夜班，則也可以加當日中班
                        candidates = candidates.filter(m => {
                            const mShift = getTeamShift(m.team, date);
                            return mShift === '中班';
                        });
                    } else if (memberShift === '早班') {
                        // 不能加中班
                        candidates = candidates.filter(m => {
                            const mShift = getTeamShift(m.team, date);
                            return mShift !== '中班';
                        });
                    } else if (memberShift === '中班') {
                        // 不能加早班
                        candidates = candidates.filter(m => {
                            const mShift = getTeamShift(m.team, date);
                            return mShift !== '早班';
                        });
                    }
                }
            }
        }

        return candidates;
    };

    // 獲取自定義時段的加班建議
    const getCustomOvertimeSuggestions = (startTime: string, endTime: string, team: string) => {
        if (!team) return { suggestion: '', reason: '' };

        const shift = getTeamShift(team, date);
        if (!shift) return { suggestion: '', reason: '' };

        // 確保時間格式一致 (把 "08:15" 轉換為 "0815")
        const formattedStartTime = startTime.replace(':', '');
        const formattedEndTime = endTime.replace(':', '');
        
        const startTimeInt = parseInt(formattedStartTime);
        const endTimeInt = parseInt(formattedEndTime);

        // 獲取上一班和下一班的班級
        const previousShiftTeam = getTeamByShift(getPreviousShift(shift), true, date);
        const nextShiftTeam = getTeamByShift(getNextShift(shift), false, date);

        // 檢查是否與上一班結束時間重疊
        const previousShiftEndTime = getShiftEndTime(getPreviousShift(shift));
        if (startTimeInt === previousShiftEndTime) {
            return {
                suggestion: previousShiftTeam,
                reason: `因請假起始時間(${formatTimeDisplay(formattedStartTime)})與上一班結束時間相同，建議由前一天${previousShiftTeam}班加班`
            };
        }

        // 檢查是否與下一班開始時間重疊
        const nextShiftStartTime = getShiftStartTime(getNextShift(shift));
        if (endTimeInt === nextShiftStartTime) {
            return {
                suggestion: nextShiftTeam,
                reason: `因請假結束時間(${formatTimeDisplay(formattedEndTime)})與下一班開始時間相同，建議由當天${nextShiftTeam}班加班`
            };
        }

        return { suggestion: '', reason: '無加班建議' };
    };

    const getSuggestions = (type: string, record: LeaveRecordType) => {
        return { suggestion: '', reason: '' };
    };

    // 獲取半天加班建議
    const getHalfDayOvertimeSuggestions = (team: string | undefined, date: string): { firstHalf: string; secondHalf: string } => {
        if (!team) return { firstHalf: '', secondHalf: '' };

        const shift = getTeamShift(team, date);
        if (!shift || shift === '小休' || shift === '大休') return { firstHalf: '', secondHalf: '' };

        // 取得 cyclePosition
        const startDate = new Date('2025/04/01');
        const targetDate = new Date(date);
        const daysDiff = Math.floor((targetDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
        const startPos = TEAM_START_POSITIONS[team];
        const cyclePosition = ((startPos + daysDiff) % 8 + 8) % 8;

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
                // 早班1: cyclePosition==1，早班2: cyclePosition==2
                firstHalfSuggestion = todayZhong;
                if (cyclePosition === 1) {
                    secondHalfSuggestion = todayXiaoXiu;
                } else {
                    secondHalfSuggestion = todayYe;
                }
                break;
            case '中班':
                // 中班1: cyclePosition==3， 中班2: cyclePosition==4
                firstHalfSuggestion = todayZao;
                if (cyclePosition === 3) {
                    secondHalfSuggestion = todayXiaoXiu;
                } else {
                    secondHalfSuggestion = todayYe;
                }
                break;
            case '夜班':
                // 夜班: cyclePosition==6 or 7
                firstHalfSuggestion = prevZao;
                secondHalfSuggestion = prevZhong;
                break;
        }

        return {
            firstHalf: firstHalfSuggestion ? `${firstHalfSuggestion}班` : '無建議',
            secondHalf: secondHalfSuggestion ? `${secondHalfSuggestion}班` : '無建議'
        };
    };

    const FullDayLeaveCard: React.FC<{ record: LeaveRecordType }> = ({ record }) => {
        const team = getMemberTeam(record.name) || undefined;
        const memberRole = team ? getMemberRole(record.name) : undefined;
        const teamShift = team ? getTeamShift(team, date) : null;
        // 移除加班卡簡易模式，不再顯示加班資訊

        return (
            <div className="space-y-2">
                <p className="text-gray-700"><span className="font-medium">請假人員：</span>{record.name} ({memberRole || '未知'})</p>
                <p className="text-gray-700"><span className="font-medium">所屬班級：</span>{team}</p>
                <p className="text-gray-700"><span className="font-medium">當天班別：</span>{teamShift || '未排班'}</p>
                <p className="text-xs text-gray-700 whitespace-nowrap"><span className="font-medium">請假時段：</span>一整天</p>
                <div className="mt-2">
                    <button onClick={e => {e.stopPropagation(); handleDelete(record);}} className="px-3 py-1 text-sm font-medium text-red-600 bg-red-50 border border-red-200 rounded-md hover:bg-red-100">取消請假</button>
                </div>
            </div>
        );
    };

    const CustomLeaveCard: React.FC<{ record: LeaveRecordType }> = ({ record }) => {
        const team = getMemberTeam(record.name) || undefined;
        const memberRole = team ? getMemberRole(record.name) : undefined;
        const teamShift = team ? getTeamShift(team, date) : null;

        return (
            <div className="space-y-2">
                <p className="text-gray-700"><span className="font-medium">請假人員：</span>{record.name} ({memberRole || '未知'})</p>
                <p className="text-gray-700"><span className="font-medium">所屬班級：</span>{team}</p>
                <p className="text-gray-700"><span className="font-medium">當天班別：</span>{teamShift || '未排班'}</p>
                <p className="text-xs text-gray-700 whitespace-nowrap">
                    <span className="font-medium">請假時段：</span>
                    {typeof record.period === 'object' && record.period !== null ? `${record.period.startTime} - ${record.period.endTime}` : '未設定時段'}
                </p>
                <div className="mt-2">
                    <button onClick={e => {e.stopPropagation(); handleDelete(record);}} className="px-3 py-1 text-sm font-medium text-red-600 bg-red-50 border border-red-200 rounded-md hover:bg-red-100">取消請假</button>
                </div>
            </div>
        );
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
                        const isLeaveExpanded = expandedIndexes[index]?.leave;
                        const isOvertimeExpanded = expandedIndexes[index]?.overtime;
                        const teamShift = team ? getTeamShift(team, date) : null;
                        
                        // 判斷是否已找齊加班人員
                        const isOvertimeComplete = record.fullDayOvertime?.type === '加整班' 
                            ? record.fullDayOvertime.fullDayMember?.confirmed 
                            : record.fullDayOvertime?.type === '加一半' 
                                ? (record.fullDayOvertime.firstHalfMember?.confirmed && record.fullDayOvertime.secondHalfMember?.confirmed)
                                : record.customOvertime?.confirmed;
                        
                        // 依據是否找齊加班人員決定背景色
                        const bgColorClass = isOvertimeComplete 
                            ? 'bg-gray-100 border-gray-200'
                            : memberRole === '班長' ? 'bg-red-50 border-red-200' : 'bg-blue-50 border-blue-200';
                        
                        // 判斷加班人員
                        let overtimePeople: React.ReactNode = '';
                        if (record.period === 'fullDay') {
                            const suggestions = getHalfDayOvertimeSuggestions(team, date);
                            let first = '';
                            let firstTeam = suggestions.firstHalf;
                            let second = '';
                            let secondTeam = suggestions.secondHalf;
                            let firstMissing = true;
                            let secondMissing = true;
                            
                            if (record.fullDayOvertime?.type === '加一半') {
                                if (record.fullDayOvertime.firstHalfMember?.name) {
                                    first = record.fullDayOvertime.firstHalfMember.name;
                                    firstTeam = record.fullDayOvertime.firstHalfMember.team;
                                    firstMissing = false;
                                }
                                if (record.fullDayOvertime.secondHalfMember?.name) {
                                    second = record.fullDayOvertime.secondHalfMember.name;
                                    secondTeam = record.fullDayOvertime.secondHalfMember.team;
                                    secondMissing = false;
                                }

                                // 顯示班別名稱，添加班字
                                if (firstTeam && !firstTeam.endsWith('班')) {
                                    firstTeam = firstTeam + '班';
                                }
                                if (secondTeam && !secondTeam.endsWith('班')) {
                                    secondTeam = secondTeam + '班';
                                }

                                overtimePeople = (
                                    <>
                                        <span>
                                            {firstMissing ? (
                                                <span><span className="text-xs">前{firstTeam}</span> <span className="text-red-500">缺</span></span>
                                            ) : (
                                                <span>
                                                    <span className="text-xs">前{firstTeam}</span> {first}
                                                </span>
                                            )}
                                        </span>
                                        <span className="mx-2" />
                                        <span>
                                            {secondMissing ? (
                                                <span><span className="text-xs">後{secondTeam}</span> <span className="text-red-500">缺</span></span>
                                            ) : (
                                                <span>
                                                    <span className="text-xs">後{secondTeam}</span> {second}
                                                </span>
                                            )}
                                        </span>
                                    </>
                                );
                            } else if (record.fullDayOvertime?.type === '加整班' && record.fullDayOvertime.fullDayMember) {
                                overtimePeople = (
                                    <span className="flex items-center justify-center">
                                        <span>{record.fullDayOvertime.fullDayMember.name}</span>
                                        <span className="text-xs ml-1">({record.fullDayOvertime.fullDayMember.team}班)</span>
                                    </span>
                                );
                            } else if (record.fullDayOvertime?.type === '加整班') {
                                // 如果選了加整班但還沒指派人員
                                const bigRestTeam = getBigRestTeam();
                                overtimePeople = (
                                    <span>
                                        <span className="text-xs">{bigRestTeam ? bigRestTeam + '班 ' : ''}</span>
                                        <span className="text-red-500">缺</span>
                                    </span>
                                );
                            }
                        } else if (record.customOvertime?.name) {
                            overtimePeople = (
                                <span className="flex items-center justify-center">
                                    <span>{record.customOvertime.name}</span>
                                    <span className="text-xs ml-1">({record.customOvertime.team}班)</span>
                                </span>
                            );
                        }
                        
                        return (
                            <div key={index} className="flex flex-row gap-2">
                                {/* 請假卡 */}
                                <div
                                    className={`flex-1 ${bgColorClass} rounded-md p-2 cursor-pointer transition-all relative`}
                                    onClick={() => toggleExpand(index, 'leave')}
                                >
                                    {!isLeaveExpanded ? (
                                        <div className="flex items-center justify-center h-full min-h-[40px] text-base font-semibold">
                                            <span className="text-gray-800">{record.name}</span>
                                            <span className="text-[0.67em] ml-1 text-gray-600">{teamShift}{record.team?.replace('班', '')}</span>
                                        </div>
                                    ) : (
                                        <div className="relative z-30">
                                            {record.period === 'fullDay' ? <FullDayLeaveCard record={record} /> : <CustomLeaveCard record={record} />}
                                        </div>
                                    )}
                                </div>

                                {/* 加班卡 */}
                                <div
                                    className={`flex-1 ${isOvertimeComplete ? 'bg-gray-100 border-gray-200' : 'bg-green-50 border-green-200'} rounded-md p-2 cursor-pointer transition-all relative`}
                                    onClick={() => {
                                        toggleExpand(index, 'overtime');
                                        setTimeout(() => {
                                            const select = document.querySelector(
                                                `.overtime-select-${record._id}`
                                            ) as HTMLSelectElement | null;
                                            if (select) select.focus();
                                        }, 100);
                                    }}
                                >
                                    {!isOvertimeExpanded ? (
                                        <div className="flex items-center justify-center h-full min-h-[40px] text-base font-semibold text-green-800">
                                            {/* 加一半時兩人水平排列 */}
                                            {record.fullDayOvertime?.type === '加一半' ? (
                                                <div className="flex flex-row items-center gap-6 justify-center w-full">
                                                    {overtimePeople}
                                                </div>
                                            ) : record.fullDayOvertime?.type === '加整班' && record.fullDayOvertime.fullDayMember ? (
                                                <span className="flex items-center justify-center">
                                                    <span>{record.fullDayOvertime.fullDayMember.name}</span>
                                                    <span className="text-xs ml-1">{record.fullDayOvertime.fullDayMember.team}</span>
                                                </span>
                                            ) : (
                                                <span>{overtimePeople || (
                                                    <>
                                                        {(() => {
                                                            const suggestions = getHalfDayOvertimeSuggestions(team, date);
                                                            let firstTeam = suggestions.firstHalf;
                                                            let secondTeam = suggestions.secondHalf;
                                                            
                                                            if (firstTeam && !firstTeam.endsWith('班')) {
                                                                firstTeam = firstTeam + '班';
                                                            }
                                                            if (secondTeam && !secondTeam.endsWith('班')) {
                                                                secondTeam = secondTeam + '班';
                                                            }
                                                            
                                                            return (
                                                                <>
                                                                    <span>
                                                                        <span className="text-xs">前{firstTeam}</span> <span className="text-red-500">缺</span>
                                                                    </span>
                                                                    <span className="mx-2" />
                                                                    <span>
                                                                        <span className="text-xs">後{secondTeam}</span> <span className="text-red-500">缺</span>
                                                                    </span>
                                                                </>
                                                            );
                                                        })()}
                                                    </>
                                                  )}</span>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="relative z-30">
                                            {/* 原本的加班卡內容 */}
                                            {record.period === 'fullDay' ? <FullDayOvertimeCard record={record} selectClassName={`overtime-select-${record._id}`} /> : <CustomOvertimeCard record={record} />}
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

    // 處理取消請假
    const handleDelete = async (record: LeaveRecordType) => {
        if (!confirm(`確定要取消 ${record.name} 的請假嗎？`)) {
            return;
        }
        try {
            const response = await fetch('/api/leave', {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    date: record.date,
                    name: record.name,
                }),
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to delete leave record');
            }
            await fetchLeaveRecords();
        } catch (error) {
            console.error('Error deleting leave record:', error);
            alert('取消請假失敗：' + (error instanceof Error ? error.message : '未知錯誤'));
        }
    };

    // useEffect for keyboard navigation
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'ArrowLeft') {
                const current = new Date(date);
                current.setDate(current.getDate() - 1);
                router.push(`/leave/${format(current, 'yyyy-MM-dd')}`);
            } else if (e.key === 'ArrowRight') {
                const current = new Date(date);
                current.setDate(current.getDate() + 1);
                router.push(`/leave/${format(current, 'yyyy-MM-dd')}`);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [date, router]);

    return (
        <div
            className="max-w-md w-full mx-auto px-2 py-4 sm:py-8"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
        >
            <div className="flex flex-col sm:flex-row items-center justify-between mb-4 sm:mb-6 gap-2">
                <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-gray-800">{formattedDate} 請假管理</h1>
                <button
                    onClick={() => router.push('/')}
                    className="w-full sm:w-auto px-3 py-2 text-xs sm:text-sm font-medium text-blue-600 bg-blue-50 rounded-xl hover:bg-blue-100"
                >
                    返回日曆
                </button>
            </div>
            <div className="bg-white rounded-lg shadow-md p-4 md:p-6 mb-8">
                {!showLeaveForm ? (
                    <button
                        className="w-full px-3 py-2 text-sm font-medium text-white rounded-md bg-blue-500 hover:bg-blue-600"
                        onClick={() => setShowLeaveForm(true)}
                    >
                        我要請假
                    </button>
                ) : (
                    <form onSubmit={e => { e.preventDefault(); handleSubmit(); }} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">班級</label>
                            <select
                                value={selectedTeam}
                                onChange={e => setSelectedTeam(e.target.value)}
                                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                            >
                                <option value="">請選擇班級</option>
                                {teamOptions.map(option => (
                                    <option key={option.value} value={option.value} disabled={!option.canLeave}>
                                        {option.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">人員</label>
                            <select
                                value={selectedMember}
                                onChange={e => setSelectedMember(e.target.value)}
                                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                                disabled={!selectedTeam}
                            >
                                <option value="">請選擇人員</option>
                                {getAvailableMembers(selectedTeam).map(name => (
                                    <option key={name} value={name}>{name}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">請假時段</label>
                            <div className="flex gap-2">
                                <label className="flex items-center">
                                    <input
                                        type="radio"
                                        name="period"
                                        value="fullDay"
                                        checked={selectedPeriod === 'fullDay'}
                                        onChange={() => setSelectedPeriod('fullDay')}
                                    />
                                    <span className="ml-1">全天</span>
                                </label>
                                <label className="flex items-center">
                                    <input
                                        type="radio"
                                        name="period"
                                        value="custom"
                                        checked={selectedPeriod === 'custom'}
                                        onChange={() => setSelectedPeriod('custom')}
                                    />
                                    <span className="ml-1">自定義時段</span>
                                </label>
                            </div>
                        </div>
                        {selectedPeriod === 'custom' && (
                            <div className="flex gap-2">
                                <div className="flex-1">
                                    <label className="block text-xs text-gray-500 mb-1">開始時間</label>
                                    <select
                                        value={customStartTime}
                                        onChange={e => setCustomStartTime(e.target.value)}
                                        className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                                    >
                                        <option value="">請選擇</option>
                                        {timeOptions.map(time => (
                                            <option key={time} value={time}>{formatTimeDisplay(time)}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="flex-1">
                                    <label className="block text-xs text-gray-500 mb-1">結束時間</label>
                                    <select
                                        value={customEndTime}
                                        onChange={e => setCustomEndTime(e.target.value)}
                                        className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                                    >
                                        <option value="">請選擇</option>
                                        {endTimeOptions.map(time => (
                                            <option key={time} value={time}>{formatTimeDisplay(time)}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        )}
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="w-full px-3 py-2 text-sm font-medium text-white rounded-md bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
                        >
                            送出請假申請
                        </button>
                    </form>
                )}
            </div>
            {renderLeaveRecords()}
        </div>
    );
};

export default LeaveDatePage;