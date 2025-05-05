import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { LeaveRecord as LeaveRecordModel } from '@/models/LeaveRecord';
import { LeaveRecord as ILeaveRecord, FullDayOvertime, CustomOvertime, OvertimeMember, Overtime } from '@/types/LeaveRecord';
import mongoose, { Document } from 'mongoose';
import type { ShiftType } from '@/types/schedule';

// 8天循環的班別順序
const SHIFT_CYCLE: ShiftType[] = [
    '大休',          // 第1天
    '早班', '早班',   // 第2-3天
    '中班', '中班',   // 第4-5天
    '小休',          // 第6天
    '夜班', '夜班'    // 第7-8天
];

// 計算2025/04/01每個班別在循環中的位置
const TEAM_START_POSITIONS: Record<string, number> = {
    'A': 0,  // 4/1 是大休，所以位置是 0
    'B': 2,  // 4/1 是早班第二天，所以 4/7 是大休
    'C': 4,  // 4/1 是中班第二天，所以 4/5 是大休
    'D': 6   // 4/1 是夜班第二天，所以 4/3 是大休
};

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const date = searchParams.get('date');
        const year = searchParams.get('year');
        const month = searchParams.get('month');

        console.log('GET API: 查詢參數:', { date, year, month });

        await connectDB();

        let query = {};
        if (date) {
            // 確保日期格式一致性
            query = { date };
            console.log('使用日期查詢:', query);
        } else if (year && month) {
            // 構建該月份的日期範圍
            const startDate = `${year}-${month.padStart(2, '0')}-01`;
            const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
            const endDate = `${year}-${month.padStart(2, '0')}-${lastDay}`;

            query = {
                date: {
                    $gte: startDate,
                    $lte: endDate
                }
            };
            console.log('使用月份範圍查詢:', query);
        }

        const records = await LeaveRecordModel.find(query).sort({ date: 1 });
        console.log(`查詢結果: 找到 ${records.length} 條記錄`);

        // 添加一個檢查來幫助調試
        if (records.length === 0) {
            // 查詢所有記錄，檢查資料庫中是否有數據
            const allRecords = await LeaveRecordModel.find({}).limit(5);
            console.log('資料庫中的樣本記錄:', allRecords);
        }

        return NextResponse.json(records);
    } catch (error) {
        console.error('Error fetching leave records:', error);
        return NextResponse.json(
            { error: 'Failed to fetch leave records' },
            { status: 500 }
        );
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { date, name, team, period, fullDayOvertime, customOvertime, overtime } = body;

        // 驗證必要字段
        if (!date || !name) {
            return NextResponse.json(
                { error: '日期和姓名為必填字段' },
                { status: 400 }
            );
        }

        // 確保 MongoDB 連接
        try {
            await connectDB();
        } catch (error) {
            console.error('MongoDB connection error:', error);
            return NextResponse.json(
                { error: '數據庫連接失敗，請稍後再試' },
                { status: 500 }
            );
        }

        // 檢查是否已經請過假
        const existingRecord = await LeaveRecordModel.findOne({ date, name });
        if (existingRecord) {
            return NextResponse.json(
                { error: '該人員已經請過假' },
                { status: 400 }
            );
        }

        // 驗證 period 格式
        if (period !== 'fullDay') {
            if (!period || typeof period !== 'object' || period.type !== 'custom') {
                return NextResponse.json(
                    { error: '請假時段格式不正確' },
                    { status: 400 }
                );
            }

            // 驗證自定義時段的時間格式
            if (!period.startTime || !period.endTime ||
                typeof period.startTime !== 'string' ||
                typeof period.endTime !== 'string') {
                return NextResponse.json(
                    { error: '自定義時段的開始和結束時間格式不正確' },
                    { status: 400 }
                );
            }

            // 驗證時間格式是否為 HH:mm
            const timeRegex = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
            if (!timeRegex.test(period.startTime) || !timeRegex.test(period.endTime)) {
                return NextResponse.json(
                    { error: '時間格式必須為 HH:mm' },
                    { status: 400 }
                );
            }
        }

        // 創建請假記錄
        const leaveRecordData: Partial<ILeaveRecord> = {
            date,
            name,
            team,
            period,
            confirmed: false,
            overtime: undefined,
            customOvertime: undefined,
            fullDayOvertime: undefined
        };

        // 處理加班信息
        if (period === 'fullDay') {
            // 處理新版甲類加班單
            if (fullDayOvertime) {
                // 檢查是否已經存在相同日期的加班記錄
                const existingOvertime = await LeaveRecordModel.findOne({
                    date,
                    $or: [
                        { 'fullDayOvertime.fullDayMember.name': fullDayOvertime.fullDayMember?.name },
                        { 'fullDayOvertime.firstHalfMember.name': fullDayOvertime.firstHalfMember?.name },
                        { 'fullDayOvertime.secondHalfMember.name': fullDayOvertime.secondHalfMember?.name }
                    ]
                });

                if (existingOvertime) {
                    return NextResponse.json(
                        { error: '該人員已經在該時段有加班記錄' },
                        { status: 400 }
                    );
                }

                // 根據加班類型構建不同的數據結構
                if (fullDayOvertime.type === '加整班') {
                    if (!fullDayOvertime.fullDayMember?.name) {
                        return NextResponse.json(
                            { error: '加整班必須選擇人員' },
                            { status: 400 }
                        );
                    }
                    leaveRecordData.fullDayOvertime = {
                        type: '加整班',
                        fullDayMember: {
                            name: fullDayOvertime.fullDayMember.name,
                            team: fullDayOvertime.fullDayMember.team,
                            confirmed: false
                        }
                    };
                } else if (fullDayOvertime.type === '加一半') {
                    // 移除必須同時選擇兩個時段人員的驗證
                    leaveRecordData.fullDayOvertime = {
                        type: '加一半',
                        firstHalfMember: fullDayOvertime.firstHalfMember ? {
                            name: fullDayOvertime.firstHalfMember.name,
                            team: fullDayOvertime.firstHalfMember.team,
                            confirmed: false
                        } : undefined,
                        secondHalfMember: fullDayOvertime.secondHalfMember ? {
                            name: fullDayOvertime.secondHalfMember.name,
                            team: fullDayOvertime.secondHalfMember.team,
                            confirmed: false
                        } : undefined
                    };
                }
            }

            // 處理舊版加班信息(向後兼容)
            if (overtime) {
                console.log('處理舊版加班數據:', overtime);
                leaveRecordData.overtime = overtime;

                // 如果沒有新版的 fullDayOvertime，則從舊版數據創建
                if (!fullDayOvertime) {
                    if (overtime.type === '全天' || overtime.type === 'bigRest') {
                        leaveRecordData.fullDayOvertime = {
                            type: '加整班',
                            fullDayMember: {
                                name: overtime.name,
                                team: overtime.team || '',
                                confirmed: overtime.confirmed || false
                            }
                        };
                    } else if (overtime.type === '半天' || overtime.type === 'regular') {
                        leaveRecordData.fullDayOvertime = {
                            type: '加一半',
                            firstHalfMember: {
                                name: overtime.name,
                                team: overtime.team || '',
                                confirmed: overtime.firstConfirmed || false
                            },
                            secondHalfMember: overtime.secondMember ? {
                                name: overtime.secondMember.name,
                                team: overtime.secondMember.team || '',
                                confirmed: overtime.secondMember.confirmed || false
                            } : {
                                name: '',
                                team: '',
                                confirmed: false
                            }
                        };
                    }
                }
            }
        } else if (period.type === 'custom') {
            // 處理自定義時段請假
            if (customOvertime) {
                leaveRecordData.customOvertime = {
                    name: customOvertime.name,
                    team: customOvertime.team || '',
                    startTime: customOvertime.startTime,
                    endTime: customOvertime.endTime,
                    confirmed: customOvertime.confirmed
                };
            }
        }

        // 保存請假記錄
        const leaveRecord = new LeaveRecordModel(leaveRecordData);
        await leaveRecord.save();

        return NextResponse.json(leaveRecord);
    } catch (error) {
        console.error('Error creating leave record:', error);
        return NextResponse.json(
            { error: 'Failed to create leave record' },
            { status: 500 }
        );
    }
}

// 更新加班確認狀態
async function updateOvertimeConfirm(
    record: Document & ILeaveRecord,
    overtimeType: string,
    memberType: string,
    confirmed: boolean
): Promise<Document & ILeaveRecord> {
    if (overtimeType === '加整班') {
        if (!record.fullDayOvertime || record.fullDayOvertime.type !== '加整班') {
            throw new Error('找不到加整班資訊');
        }
        if (!record.fullDayOvertime.fullDayMember) {
            throw new Error('請先選擇加整班人員');
        }
        record.fullDayOvertime.fullDayMember.confirmed = confirmed;
    } else if (overtimeType === '加一半') {
        if (!record.fullDayOvertime || record.fullDayOvertime.type !== '加一半') {
            throw new Error('找不到加一半資訊');
        }

        if (memberType === '前半') {
            if (!record.fullDayOvertime.firstHalfMember) {
                throw new Error('請先選擇前半加班人員');
            }
            if (!confirmed) {
                record.fullDayOvertime.firstHalfMember = undefined;
            } else {
                record.fullDayOvertime.firstHalfMember.confirmed = true;
            }
        } else if (memberType === '後半') {
            if (!record.fullDayOvertime.secondHalfMember) {
                throw new Error('請先選擇後半加班人員');
            }
            if (!confirmed) {
                record.fullDayOvertime.secondHalfMember = undefined;
            } else {
                record.fullDayOvertime.secondHalfMember.confirmed = true;
            }
        }
    }

    await record.save();
    return record;
}

// 更新加班資訊
async function updateOvertime(
    record: Document & ILeaveRecord,
    overtimeData: {
        type: '加整班' | '加一半';
        fullDayMember?: { name: string; team: string };
        firstHalfMember?: { name: string; team: string };
        secondHalfMember?: { name: string; team: string };
    }
): Promise<Document & ILeaveRecord> {
    const { type } = overtimeData;

    if (type === '加整班') {
        if (!overtimeData.fullDayMember) {
            throw new Error('加整班必須選擇人員');
        }
        record.fullDayOvertime = {
            type: '加整班',
            fullDayMember: {
                name: overtimeData.fullDayMember.name,
                team: overtimeData.fullDayMember.team,
                confirmed: false
            }
        } as FullDayOvertime;
    } else if (type === '加一半') {
        // 初始化 fullDayOvertime，如果不存在或類型不是 '加一半'
        if (!record.fullDayOvertime || record.fullDayOvertime.type !== '加一半') {
            record.fullDayOvertime = {
                type: '加一半',
                firstHalfMember: undefined,
                secondHalfMember: undefined
            } as FullDayOvertime;
        }

        // 更新前半加班人員，保持後半不變
        if (overtimeData.firstHalfMember) {
            record.fullDayOvertime.firstHalfMember = {
                name: overtimeData.firstHalfMember.name,
                team: overtimeData.firstHalfMember.team,
                confirmed: false
            };
        }

        // 更新後半加班人員，保持前半不變
        if (overtimeData.secondHalfMember) {
            record.fullDayOvertime.secondHalfMember = {
                name: overtimeData.secondHalfMember.name,
                team: overtimeData.secondHalfMember.team,
                confirmed: false
            };
        }
    }

    await record.save();
    return record;
}

export async function DELETE(request: Request) {
    try {
        const body = await request.json();
        const { date, name } = body;

        if (!date || !name) {
            return NextResponse.json(
                { error: '日期和姓名為必填字段' },
                { status: 400 }
            );
        }

        await connectDB();

        // 查找並刪除請假記錄
        const result = await LeaveRecordModel.deleteOne({ date, name });

        if (result.deletedCount === 0) {
            return NextResponse.json(
                { error: '找不到要刪除的請假記錄' },
                { status: 404 }
            );
        }

        return NextResponse.json({ message: '請假記錄已成功刪除' });
    } catch (error) {
        console.error('Error deleting leave record:', error);
        return NextResponse.json(
            { error: '刪除請假記錄失敗' },
            { status: 500 }
        );
    }
}

export async function PUT(request: Request) {
    try {
        const body = await request.json();
        const { date, name, fullDayOvertime, customOvertime, confirm, halfType, clearOvertime } = body;

        if (!date || !name) {
            return NextResponse.json(
                { error: '日期和姓名為必填字段' },
                { status: 400 }
            );
        }

        await connectDB();

        // 查找請假記錄
        const record = await LeaveRecordModel.findOne({ date, name });
        if (!record) {
            return NextResponse.json(
                { error: '找不到請假記錄' },
                { status: 404 }
            );
        }

        // 明確處理取消加班的請求
        if (clearOvertime) {
            console.log('處理取消加班請求:', { date, name });
            record.fullDayOvertime = undefined;
            record.customOvertime = undefined;
            await record.save();
            return NextResponse.json(record);
        }

        // 處理確認狀態的更新
        if (confirm !== undefined) {
            try {
                const overtimeType = record.fullDayOvertime?.type || '';
                let memberType = '';

                if (halfType) {
                    memberType = halfType === 'first' ? '前半' : '後半';
                } else if (overtimeType === '加整班') {
                    memberType = 'fullDay';
                }

                await updateOvertimeConfirm(record, overtimeType, memberType, confirm);
                return NextResponse.json(record);
            } catch (error) {
                console.error('Error updating overtime confirmation:', error);
                return NextResponse.json(
                    { error: error instanceof Error ? error.message : '更新加班確認狀態失敗' },
                    { status: 400 }
                );
            }
        }

        // 更新全天請假的加班資訊
        if (fullDayOvertime) {
            // 檢查是否是清空請求（取消加班）
            const isEmpty =
                (!fullDayOvertime.type || fullDayOvertime.type === '') &&
                (!fullDayOvertime.fullDayMember || !fullDayOvertime.fullDayMember.name) &&
                (!fullDayOvertime.firstHalfMember || !fullDayOvertime.firstHalfMember.name) &&
                (!fullDayOvertime.secondHalfMember || !fullDayOvertime.secondHalfMember.name);

            if (isEmpty) {
                // 如果是清空請求，將整個 fullDayOvertime 設置為 undefined
                record.fullDayOvertime = undefined;
                await record.save();
                return NextResponse.json(record);
            }

            try {
                // 更新全天加班信息
                if (!record.fullDayOvertime) {
                    // 如果沒有現有的加班記錄，創建一個新的
                    record.fullDayOvertime = {
                        type: fullDayOvertime.type,
                        confirmed: false
                    };
                } else {
                    // 如果有現有的加班記錄，更新類型
                    record.fullDayOvertime.type = fullDayOvertime.type;
                }
                
                // 根據加班類型更新相應的人員信息
                if (fullDayOvertime.type === '加整班' && fullDayOvertime.fullDayMember) {
                    record.fullDayOvertime.fullDayMember = {
                        name: fullDayOvertime.fullDayMember.name,
                        team: fullDayOvertime.fullDayMember.team,
                        confirmed: fullDayOvertime.fullDayMember.confirmed || false
                    };
                } else if (fullDayOvertime.type === '加一半') {
                    // 處理前半加班
                    if (fullDayOvertime.firstHalfMember) {
                        record.fullDayOvertime.firstHalfMember = {
                            name: fullDayOvertime.firstHalfMember.name,
                            team: fullDayOvertime.firstHalfMember.team,
                            confirmed: fullDayOvertime.firstHalfMember.confirmed || false
                        };
                    }

                    // 處理後半加班
                    if (fullDayOvertime.secondHalfMember) {
                        record.fullDayOvertime.secondHalfMember = {
                            name: fullDayOvertime.secondHalfMember.name,
                            team: fullDayOvertime.secondHalfMember.team,
                            confirmed: fullDayOvertime.secondHalfMember.confirmed || false
                        };
                    }
                }
                
                await record.save();
            } catch (error) {
                console.error('Error updating overtime:', error);
                return NextResponse.json(
                    { error: error instanceof Error ? error.message : '更新加班資訊失敗' },
                    { status: 400 }
                );
            }
        }

        // 更新自定義時段加班資訊
        if (customOvertime) {
            // Check if all fields are empty/false (i.e., a cancel request)
            const isEmpty =
                (!customOvertime.name || customOvertime.name === '') &&
                (!customOvertime.team || customOvertime.team === '') &&
                (!customOvertime.startTime || customOvertime.startTime === '') &&
                (!customOvertime.endTime || customOvertime.endTime === '') &&
                (customOvertime.confirmed === false || customOvertime.confirmed === undefined);
            if (isEmpty) {
                record.customOvertime = undefined;
            } else {
            record.customOvertime = {
                name: customOvertime.name,
                team: customOvertime.team || '',
                startTime: customOvertime.startTime,
                endTime: customOvertime.endTime,
                confirmed: customOvertime.confirmed
            };
            }
            await record.save();
        }

        return NextResponse.json(record);
    } catch (error) {
        console.error('Error updating leave record:', error);
        return NextResponse.json(
            { error: '更新請假記錄失敗' },
            { status: 500 }
        );
    }
}

// 新增檢查是否為大休班級的函數
async function checkIfBigRestTeam(team: string, date: string): Promise<boolean> {
    // 檢查該班級在指定日期是否為大休
    const targetDate = new Date(date);
    const startDate = new Date('2025/04/01');
    const daysDiff = Math.floor((targetDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

    // 計算在 8 天循環中的位置
    const cyclePosition = (TEAM_START_POSITIONS[team] + daysDiff) % 8;

    // 獲取該天的班別
    const shift = SHIFT_CYCLE[cyclePosition];
    console.log('班別計算:', {
        team,
        date,
        daysDiff,
        startPosition: TEAM_START_POSITIONS[team],
        cyclePosition,
        shift
    });

    return shift === '大休';
}

// 新增檢查是否為小休班級的函數
async function checkIfSmallRestTeam(team: string, date: string): Promise<boolean> {
    // 檢查該班級在指定日期是否為小休
    const targetDate = new Date(date);
    const startDate = new Date('2025/04/01');
    const daysDiff = Math.floor((targetDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

    // 計算在 8 天循環中的位置
    const cyclePosition = (TEAM_START_POSITIONS[team] + daysDiff) % 8;

    // 獲取該天的班別
    const shift = SHIFT_CYCLE[cyclePosition];
    console.log('班別計算:', {
        team,
        date,
        daysDiff,
        startPosition: TEAM_START_POSITIONS[team],
        cyclePosition,
        shift
    });

    return shift === '小休';
} 