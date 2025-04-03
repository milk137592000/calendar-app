'use client';

import React, { useState, useEffect } from 'react';
import { format, isAfter, isToday, startOfDay } from 'date-fns';
import { useParams, useRouter } from 'next/navigation';
import { TEAMS } from '@/data/teams';
import { getShiftForDate, getMemberTeam, isTeamBigRestOnTuesday } from '@/utils/schedule';
import type { LeaveRecord } from '@/types/LeaveRecord';

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
    'A': 8,  // 大休是第8天
    'B': 2,  // 早班(第2天)是第2天
    'C': 4,  // 中班(第2天)是第4天
    'D': 6   // 夜班(第1天)是第6天
};

export default function LeaveDatePage() {
    const router = useRouter();
    const params = useParams();
    const date = params.date as string;
    const formattedDate = format(new Date(date), 'yyyy年MM月dd日');
    
    const [selectedTeam, setSelectedTeam] = useState<string>('');
    const [selectedMember, setSelectedMember] = useState<string>('');
    const [isSubmitted, setIsSubmitted] = useState(false);
    const [leaveRecords, setLeaveRecords] = useState<LeaveRecord[]>([]);

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

    // 獲取請假記錄
    const fetchLeaveRecords = async () => {
        try {
            const response = await fetch(`/api/leave?date=${date}`);
            if (!response.ok) throw new Error('Failed to fetch leave records');
            const records = await response.json();
            setLeaveRecords(records);
        } catch (error) {
            console.error('Error fetching leave records:', error);
        }
    };

    // 生成班級選項
    const teamOptions = Object.keys(TEAMS).map(team => ({
        value: team,
        label: `${team}班`
    }));

    // 根據選擇的班級生成人員選項
    const memberOptions = selectedTeam ? TEAMS[selectedTeam].members.map(member => ({
        value: member.name,
        label: `${member.name} (${member.role})`
    })) : [];

    // 獲取指定日期的班別
    const getShiftForDate = (team: string, date: string) => {
        const startDate = new Date(2025, 3, 1);
        const targetDate = new Date(date);
        const daysDiff = Math.floor((targetDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
        
        const startPos = TEAM_START_POSITIONS[team];
        const cyclePosition = ((startPos - 1 + daysDiff) % 8 + 8) % 8;
        return SHIFT_CYCLE[cyclePosition];
    };

    // 獲取人員所屬班級
    const getMemberTeam = (memberName: string) => {
        for (const [team, teamData] of Object.entries(TEAMS)) {
            if (teamData.members.some(member => member.name === memberName)) {
                return team;
            }
        }
        return null;
    };

    // 獲取人員角色
    const getMemberRole = (memberName: string) => {
        for (const teamData of Object.values(TEAMS)) {
            const member = teamData.members.find(m => m.name === memberName);
            if (member) return member.role;
        }
        return null;
    };

    // 檢查是否可以請假
    const canTakeLeave = (team: string, memberName: string) => {
        if (isNotFutureDate()) {
            return false;
        }

        const shift = getShiftForDate(team, date);
        if (!shift) return false;
        
        if (shift === '小休' || shift === '大休') {
            return false;
        }
        return true;
    };

    // 獲取班級當天班別
    const getTeamShift = (team: string) => {
        return getShiftForDate(team, date);
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

    // 找出可加班的人員（大休班級）
    const findBigRestMembers = (team: string, leaveRequester: string) => {
        const availableMembers: string[] = [];
        const leaveRole = getMemberRole(leaveRequester);
        const bigRestTeam = getBigRestTeam();
        
        if (!bigRestTeam) return [];
        
        // 檢查大休班級在週二是否為大休
        if (isTeamBigRestOnTuesday(bigRestTeam)) {
            return [];
        }
        
        const teamData = TEAMS[bigRestTeam];
        teamData.members.forEach(member => {
            const isOnLeave = leaveRecords.some(record => 
                record.date === date && record.name === member.name
            );
            
            if (!isOnLeave) {
                if (leaveRole === '班長' && member.role === '班長') {
                    availableMembers.push(member.name);
                } else if (leaveRole === '班員') {
                    availableMembers.push(member.name);
                }
            }
        });
        
        return availableMembers;
    };

    // 找出可加班的人員（平日）
    const findRegularMembers = (team: string, leaveRequester: string, isSecondMember: boolean = false) => {
        const availableMembers: string[] = [];
        const leaveRole = getMemberRole(leaveRequester);
        
        // 找出所有可加班的人員（除了同班人員）
        for (const [teamName, teamData] of Object.entries(TEAMS)) {
            if (teamName === team) continue;  // 跳過同班人員
            
            teamData.members.forEach(member => {
                const isOnLeave = leaveRecords.some(record => 
                    record.date === date && record.name === member.name
                );
                
                if (!isOnLeave) {
                    if (leaveRole === '班長' && member.role === '班長') {
                        availableMembers.push(member.name);
                    } else if (leaveRole === '班員') {
                        availableMembers.push(member.name);
                    }
                }
            });
        }
        
        return availableMembers;
    };

    // 獲取當日大休的班級
    const getBigRestTeam = () => {
        for (const [team, teamData] of Object.entries(TEAMS)) {
            const shift = getShiftForDate(team, date);
            if (shift === '大休') {
                return team;
            }
        }
        return null;
    };

    // 獲取指定班別的班級代號
    const getTeamByShift = (shift: ShiftType, isPreviousDay: boolean = false) => {
        const targetDate = new Date(date);
        if (isPreviousDay) {
            targetDate.setDate(targetDate.getDate() - 1);
        }
        const targetDateStr = format(targetDate, 'yyyy-MM-dd');
        
        for (const [team, teamData] of Object.entries(TEAMS)) {
            const teamShift = getShiftForDate(team, targetDateStr);
            if (teamShift === shift) {
                return team;
            }
        }
        return '';
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

    // 提交請假
    const handleSubmit = async () => {
        if (!selectedTeam || !selectedMember) {
            alert('請選擇班級和人員');
            return;
        }

        if (!canTakeLeave(selectedTeam, selectedMember)) {
            if (isNotFutureDate()) {
                alert('今天以前的日期不可請假');
            } else {
                const shift = getShiftForDate(selectedTeam, date);
                alert(`該班級當天為${shift}，不得請假`);
            }
            return;
        }

        const availableMembers = findRegularMembers(selectedTeam, selectedMember);
        if (availableMembers.length === 0) {
            alert('沒有可加班的人員');
            return;
        }

        const newRecord: LeaveRecord = {
            date,
            name: selectedMember,
            overtime: {
                type: 'regular' as const,
                name: '',
                team: '',
                confirmed: false
            }
        };

        try {
            const response = await fetch('/api/leave', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(newRecord),
            });

            if (!response.ok) throw new Error('Failed to create leave record');
            
            await fetchLeaveRecords();
            setIsSubmitted(true);
        } catch (error) {
            console.error('Error creating leave record:', error);
            alert('請假失敗，請稍後再試');
        }
    };

    // 更新加班類型
    const handleUpdateOvertimeType = async (record: LeaveRecord, type: 'bigRest' | 'regular') => {
        try {
            const response = await fetch('/api/leave', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    date: record.date,
                    name: record.name,
                    overtime: {
                        type,
                        name: '',
                        team: '',
                        confirmed: false
                    }
                }),
            });

            if (!response.ok) throw new Error('Failed to update overtime type');
            
            await fetchLeaveRecords();
        } catch (error) {
            console.error('Error updating overtime type:', error);
            alert('更新加班類型失敗，請稍後再試');
        }
    };

    // 更新加班人員
    const handleUpdateOvertime = async (record: LeaveRecord, newOvertimeMember: string) => {
        const overtimeTeam = getMemberTeam(newOvertimeMember);
        if (!overtimeTeam || !record.overtime) return;

        // 檢查該班級在週二是否為大休
        if (isTeamBigRestOnTuesday(overtimeTeam)) {
            alert('該班級在週二為大休，不能加班');
            return;
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
                    overtime: {
                        ...record.overtime,
                        name: newOvertimeMember,
                        team: overtimeTeam,
                        confirmed: false,
                        firstConfirmed: false
                    }
                }),
            });

            if (!response.ok) throw new Error('Failed to update overtime member');
            
            await fetchLeaveRecords();
        } catch (error) {
            console.error('Error updating overtime member:', error);
            alert('更新加班人員失敗，請稍後再試');
        }
    };

    // 更新第二位加班人員
    const handleUpdateSecondOvertime = async (record: LeaveRecord, newSecondMember: string) => {
        const secondTeam = getMemberTeam(newSecondMember);
        if (!secondTeam || !record.overtime) return;

        // 檢查該班級在週二是否為大休
        if (isTeamBigRestOnTuesday(secondTeam)) {
            alert('該班級在週二為大休，不能加班');
            return;
        }

        // 檢查是否與第一位加班人員同班
        if (record.overtime.team === secondTeam) {
            alert('第二位加班人員不能與第一位加班人員同班');
            return;
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
                    overtime: {
                        ...record.overtime,
                        secondMember: {
                            name: newSecondMember,
                            team: secondTeam,
                            confirmed: false
                        }
                    }
                }),
            });

            if (!response.ok) throw new Error('Failed to update second overtime member');
            
            await fetchLeaveRecords();
        } catch (error) {
            console.error('Error updating second overtime member:', error);
            alert('更新第二位加班人員失敗，請稍後再試');
        }
    };

    // 更新加班確認狀態
    const handleUpdateOvertimeConfirm = async (record: LeaveRecord, isSecondMember: boolean = false) => {
        try {
            const response = await fetch('/api/leave', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    date: record.date,
                    name: record.name,
                    overtime: {
                        ...record.overtime,
                        ...(isSecondMember && record.overtime
                            ? {
                                secondMember: {
                                    ...record.overtime?.secondMember,
                                    confirmed: !record.overtime?.secondMember?.confirmed
                                }
                            }
                            : {
                                confirmed: !record.overtime?.confirmed,
                                firstConfirmed: !record.overtime?.firstConfirmed
                            })
                    }
                }),
            });

            if (!response.ok) throw new Error('Failed to update overtime confirmation');
            
            await fetchLeaveRecords();
        } catch (error) {
            console.error('Error updating overtime confirmation:', error);
            alert('更新加班確認狀態失敗，請稍後再試');
        }
    };

    // 更新請假確認狀態
    const handleUpdateLeaveConfirm = async (record: LeaveRecord) => {
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
    const handleDelete = async (record: LeaveRecord) => {
        if (!confirm('確定要刪除這筆請假記錄嗎？')) return;

        try {
            const response = await fetch('/api/leave', {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    date: record.date,
                    name: record.name
                }),
            });

            if (!response.ok) throw new Error('Failed to delete leave record');
            
            await fetchLeaveRecords();
        } catch (error) {
            console.error('Error deleting leave record:', error);
            alert('刪除請假記錄失敗，請稍後再試');
        }
    };

    useEffect(() => {
        fetchLeaveRecords();
    }, [date]);

    return (
        <main className="min-h-screen bg-gray-100">
            <div className="container mx-auto py-8 px-4">
                <div className="max-w-2xl mx-auto bg-white rounded-lg shadow-lg p-6">
                    <h1 className="text-2xl font-bold text-gray-800 mb-4">
                        請假日期：{formattedDate}
                        {isNotFutureDate() && (
                            <span className="ml-2 text-sm text-red-600">
                                (今天以前的日期不可請假)
                            </span>
                        )}
                    </h1>
                    <div className="space-y-4">
                        <div className="flex items-center space-x-4">
                            <label className="block text-sm font-medium text-gray-700 w-24">
                                選擇班級：
                            </label>
                            <select
                                value={selectedTeam}
                                onChange={(e) => {
                                    setSelectedTeam(e.target.value);
                                    setSelectedMember('');
                                }}
                                className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                                disabled={isNotFutureDate()}
                            >
                                <option value="">請選擇班級</option>
                                {teamOptions.map((option) => {
                                    const teamShift = getTeamShift(option.value);
                                    const canLeave = teamShift && teamShift !== '小休' && teamShift !== '大休';
                                    return (
                                        <option 
                                            key={option.value} 
                                            value={option.value}
                                            disabled={!canLeave || isNotFutureDate()}
                                        >
                                            {option.label} {!canLeave ? `(當天為${teamShift})` : `(當天為${teamShift})`}
                                        </option>
                                    );
                                })}
                            </select>
                        </div>
                        {selectedTeam && (
                            <div className="text-sm text-gray-600">
                                該班級當天班別：{getTeamShift(selectedTeam) || '未排班'}
                            </div>
                        )}
                        <div className="flex items-center space-x-4">
                            <label className="block text-sm font-medium text-gray-700 w-24">
                                選擇人員：
                            </label>
                            <select
                                value={selectedMember}
                                onChange={(e) => setSelectedMember(e.target.value)}
                                className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                                disabled={!selectedTeam || !canTakeLeave(selectedTeam, selectedMember)}
                            >
                                <option value="">請選擇人員</option>
                                {memberOptions.map((option) => (
                                    <option 
                                        key={option.value} 
                                        value={option.value}
                                    >
                                        {option.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                        {selectedTeam && !canTakeLeave(selectedTeam, selectedMember) && (
                            <div className="text-red-600 text-sm">
                                該班級當天為休息日，不得請假
                            </div>
                        )}
                        <div className="flex justify-end space-x-4 mt-6">
                            <button
                                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                                onClick={() => router.push('/')}
                            >
                                返回
                            </button>
                            <button
                                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                                onClick={handleSubmit}
                                disabled={!selectedTeam || !selectedMember || !canTakeLeave(selectedTeam, selectedMember)}
                            >
                                確認請假
                            </button>
                        </div>
                    </div>
                    
                    {leaveRecords.length > 0 && (
                        <div className="mt-8">
                            <h2 className="text-lg font-semibold text-gray-800 mb-4">當日請假記錄</h2>
                            <div className="space-y-2">
                                {leaveRecords.map((record, index) => {
                                    const team = getMemberTeam(record.name);
                                    const role = getMemberRole(record.name);
                                    const bgColor = role === '班長' ? 'bg-red-50' : 'bg-blue-50';
                                    const borderColor = role === '班長' ? 'border-red-200' : 'border-blue-200';
                                    
                                    const bigRestMembers = findBigRestMembers(team || '', record.name);
                                    const regularMembers = findRegularMembers(team || '', record.name, !!record.overtime?.name);
                                    const bigRestOptions = bigRestMembers.map(name => ({
                                        value: name,
                                        label: `${name} (${getMemberTeam(name)}班 ${getMemberRole(name)})`
                                    }));
                                    const regularOptions = regularMembers.map(name => ({
                                        value: name,
                                        label: `${name} (${getMemberTeam(name)}班 ${getMemberRole(name)})`
                                    }));

                                    const bigRestTeam = getBigRestTeam();
                                    
                                    return (
                                        <div key={index} className="flex gap-4">
                                            {/* 請假單 */}
                                            <div className={`flex-1 ${bgColor} border ${borderColor} rounded-md p-4`}>
                                                <div className="space-y-2">
                                                    <p className="text-gray-700">
                                                        <span className="font-medium">請假人員：</span>
                                                        {record.name}
                                                    </p>
                                                    <p className="text-gray-700">
                                                        <span className="font-medium">所屬班級：</span>
                                                        {team}班
                                                    </p>
                                                    <p className="text-gray-700">
                                                        <span className="font-medium">當天班別：</span>
                                                        {team ? getTeamShift(team) || '未排班' : '未知'}
                                                    </p>
                                                    {isTodayOrFuture() && (
                                                        <div className="mt-2">
                                                            <button
                                                                onClick={() => handleDelete(record)}
                                                                className="px-3 py-1 text-sm font-medium text-red-600 bg-red-50 border border-red-200 rounded-md hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                                                            >
                                                                取消請假
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* 加班單 */}
                                            <div className="flex-1 bg-green-50 border border-green-200 rounded-md p-4">
                                                <div className="space-y-2">
                                                    {bigRestTeam && (
                                                        <p className="text-sm text-green-600 font-medium">
                                                            加班建議：大休班級為 {bigRestTeam}班
                                                        </p>
                                                    )}
                                                    {record.overtime?.type && (
                                                        <div className="space-y-4">
                                                            <p className="text-gray-700">
                                                                <span className="font-medium">加班類型：</span>
                                                                {isTodayOrFuture() ? (
                                                                    <select
                                                                        value={record.overtime?.type || 'regular'}
                                                                        onChange={(e) => handleUpdateOvertimeType(record, e.target.value as 'bigRest' | 'regular')}
                                                                        className="ml-2 text-sm rounded border border-green-200 focus:border-green-500 focus:ring-green-500"
                                                                    >
                                                                        {bigRestTeam && (
                                                                            <option value="bigRest">加整班</option>
                                                                        )}
                                                                        <option value="regular">加一半</option>
                                                                    </select>
                                                                ) : record.overtime?.type === 'bigRest' ? (
                                                                    '加整班'
                                                                ) : record.overtime?.type === 'regular' ? (
                                                                    '加一半'
                                                                ) : (
                                                                    '未選擇加班類型'
                                                                )}
                                                            </p>
                                                            {record.overtime.type === 'regular' && (
                                                                <p className="text-sm text-green-600 font-medium">
                                                                    加班建議：<br />
                                                                    {team && getTeamShift(team) === '早班' ? (
                                                                        isFirstDayOfShift(team, '早班') ? (
                                                                            <>
                                                                                第一加班人員：{getTeamByShift('中班')}班<br />
                                                                                第二加班人員：{getTeamByShift('小休')}班
                                                                            </>
                                                                        ) : (
                                                                            <>
                                                                                第一加班人員：{getTeamByShift('中班')}班<br />
                                                                                第二加班人員：{getTeamByShift('夜班')}班
                                                                            </>
                                                                        )
                                                                    ) : team && getTeamShift(team) === '中班' ? (
                                                                        isFirstDayOfShift(team, '中班') ? (
                                                                            <>
                                                                                第一加班人員：{getTeamByShift('早班')}班<br />
                                                                                第二加班人員：{getTeamByShift('小休')}班
                                                                            </>
                                                                        ) : (
                                                                            <>
                                                                                第一加班人員：{getTeamByShift('早班')}班<br />
                                                                                第二加班人員：{getTeamByShift('夜班')}班
                                                                            </>
                                                                        )
                                                                    ) : team && getTeamShift(team) === '夜班' ? (
                                                                        <>
                                                                            第一加班人員：{getTeamByShift('早班', true)}班<br />
                                                                            第二加班人員：{getTeamByShift('中班', true)}班
                                                                        </>
                                                                    ) : (
                                                                        '請選擇加班類型'
                                                                    )}
                                                                </p>
                                                            )}
                                                            {record.overtime.type === 'bigRest' ? (
                                                                <div className="space-y-2">
                                                                    <select
                                                                        value={record.overtime.name || ''}
                                                                        onChange={(e) => handleUpdateOvertime(record, e.target.value)}
                                                                        className="w-full text-sm rounded border border-green-200 focus:border-green-500 focus:ring-green-500"
                                                                        disabled={record.overtime.firstConfirmed}
                                                                    >
                                                                        <option value="">請選擇加班人員</option>
                                                                        {bigRestOptions
                                                                            .filter(option => option.value !== record.name)
                                                                            .map((option) => (
                                                                                <option key={option.value} value={option.value}>
                                                                                    {option.label}
                                                                                </option>
                                                                            ))}
                                                                    </select>
                                                                    {record.overtime.name && !record.overtime.firstConfirmed && (
                                                                        <div className="mt-2">
                                                                            <button
                                                                                onClick={() => handleUpdateOvertimeConfirm(record, false)}
                                                                                className="px-3 py-1 text-sm font-medium text-green-600 bg-green-50 border border-green-200 rounded-md hover:bg-green-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                                                                            >
                                                                                確認加班
                                                                            </button>
                                                                        </div>
                                                                    )}
                                                                    {record.overtime.name && record.overtime.firstConfirmed && (
                                                                        <div className="mt-2">
                                                                            <button
                                                                                onClick={() => handleUpdateOvertimeConfirm(record, true)}
                                                                                className="px-3 py-1 text-sm font-medium text-red-600 bg-red-50 border border-red-200 rounded-md hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                                                                            >
                                                                                取消加班
                                                                            </button>
                                                                        </div>
                                                                    )}
                                                                    {record.overtime.name && (
                                                                        <>
                                                                            <p className="text-gray-700">
                                                                                <span className="font-medium">所屬班級：</span>
                                                                                {record.overtime.team}班
                                                                            </p>
                                                                            <p className="text-gray-700">
                                                                                <span className="font-medium">當天班別：</span>
                                                                                {getTeamShift(record.overtime.team)}
                                                                            </p>
                                                                        </>
                                                                    )}
                                                                </div>
                                                            ) : (
                                                                <div className="space-y-4">
                                                                    <div className="flex gap-4">
                                                                        <div className="flex-1">
                                                                            <p className="text-sm text-gray-600 mb-1">第一位加班人員</p>
                                                                            <select
                                                                                value={record.overtime.name || ''}
                                                                                onChange={(e) => handleUpdateOvertime(record, e.target.value)}
                                                                                className="w-full text-sm rounded border border-green-200 focus:border-green-500 focus:ring-green-500"
                                                                                disabled={record.overtime.firstConfirmed}
                                                                            >
                                                                                <option value="">請選擇加班人員</option>
                                                                                {regularOptions
                                                                                    .filter(option => {
                                                                                        const memberTeam = getMemberTeam(option.value);
                                                                                        return memberTeam !== team && (!record.overtime?.secondMember?.name || option.value !== record.overtime.secondMember.name);
                                                                                    })
                                                                                    .map((option) => (
                                                                                        <option key={option.value} value={option.value}>
                                                                                            {option.label}
                                                                                        </option>
                                                                                    ))}
                                                                            </select>
                                                                            {record.overtime.name && !record.overtime.firstConfirmed && (
                                                                                <div className="mt-2">
                                                                                    <button
                                                                                        onClick={() => handleUpdateOvertimeConfirm(record, false)}
                                                                                        className="px-3 py-1 text-sm font-medium text-green-600 bg-green-50 border border-green-200 rounded-md hover:bg-green-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                                                                                    >
                                                                                        確認加班
                                                                                    </button>
                                                                                </div>
                                                                            )}
                                                                            {record.overtime.name && record.overtime.firstConfirmed && (
                                                                                <div className="mt-2">
                                                                                    <button
                                                                                        onClick={() => handleUpdateOvertimeConfirm(record, true)}
                                                                                        className="px-3 py-1 text-sm font-medium text-red-600 bg-red-50 border border-red-200 rounded-md hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                                                                                    >
                                                                                        取消加班
                                                                                    </button>
                                                                                </div>
                                                                            )}
                                                                            {record.overtime.name && (
                                                                                <>
                                                                                    <p className="text-gray-700">
                                                                                        <span className="font-medium">所屬班級：</span>
                                                                                        {record.overtime.team}班
                                                                                    </p>
                                                                                    <p className="text-gray-700">
                                                                                        <span className="font-medium">當天班別：</span>
                                                                                        {getTeamShift(record.overtime.team)}
                                                                                    </p>
                                                                                </>
                                                                            )}
                                                                        </div>
                                                                        <div className="flex-1">
                                                                            <p className="text-sm text-gray-600 mb-1">第二位加班人員</p>
                                                                            <select
                                                                                value={record.overtime.secondMember?.name || ''}
                                                                                onChange={(e) => handleUpdateSecondOvertime(record, e.target.value)}
                                                                                className="w-full text-sm rounded border border-green-200 focus:border-green-500 focus:ring-green-500"
                                                                                disabled={record.overtime.secondMember?.confirmed}
                                                                            >
                                                                                <option value="">請選擇加班人員</option>
                                                                                {regularOptions
                                                                                    .filter(option => {
                                                                                        const memberTeam = getMemberTeam(option.value);
                                                                                        return memberTeam !== team && (!record.overtime?.name || option.value !== record.overtime.name);
                                                                                    })
                                                                                    .map((option) => (
                                                                                        <option key={option.value} value={option.value}>
                                                                                            {option.label}
                                                                                        </option>
                                                                                    ))}
                                                                            </select>
                                                                            {record.overtime.secondMember?.name && !record.overtime.secondMember.confirmed && (
                                                                                <div className="mt-2">
                                                                                    <button
                                                                                        onClick={() => handleUpdateOvertimeConfirm(record, true)}
                                                                                        className="px-3 py-1 text-sm font-medium text-green-600 bg-green-50 border border-green-200 rounded-md hover:bg-green-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                                                                                    >
                                                                                        確認加班
                                                                                    </button>
                                                                                </div>
                                                                            )}
                                                                            {record.overtime.secondMember?.confirmed && (
                                                                                <div className="mt-2">
                                                                                    <button
                                                                                        onClick={() => handleUpdateOvertimeConfirm(record, true)}
                                                                                        className="px-3 py-1 text-sm font-medium text-red-600 bg-red-50 border border-red-200 rounded-md hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                                                                                    >
                                                                                        取消加班
                                                                                    </button>
                                                                                </div>
                                                                            )}
                                                                            {record.overtime.secondMember?.name && (
                                                                                <>
                                                                                    <p className="text-gray-700">
                                                                                        <span className="font-medium">所屬班級：</span>
                                                                                        {record.overtime.secondMember.team}班
                                                                                    </p>
                                                                                    <p className="text-gray-700">
                                                                                        <span className="font-medium">當天班別：</span>
                                                                                        {getTeamShift(record.overtime.secondMember.team)}
                                                                                    </p>
                                                                                </>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </main>
    );
} 