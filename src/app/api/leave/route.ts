import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import LeaveRecord from '@/models/LeaveRecord';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const date = searchParams.get('date');
        const year = searchParams.get('year');
        const month = searchParams.get('month');

        await connectDB();

        let query = {};
        if (date) {
            query = { date };
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
        }

        const records = await LeaveRecord.find(query).sort({ date: 1 });
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
        const { date, name, team, period, overtime, customOvertime } = body;

        await connectDB();

        // 檢查是否已經請過假
        const existingRecord = await LeaveRecord.findOne({ date, name });
        if (existingRecord) {
            return NextResponse.json(
                { error: '該人員已經請過假' },
                { status: 400 }
            );
        }

        // 根據請假類型設置加班資訊
        let overtimeData = {};
        if (period === 'fullDay') {
            // 提供默認的overtime以滿足模型驗證需求
            overtimeData = {
                overtime: overtime || {
                    type: '全天',
                    name: '',
                    team: '',
                    confirmed: false,
                    firstConfirmed: false,
                    secondMember: {
                        name: '',
                        team: '',
                        confirmed: false
                    }
                }
            };
        } else if (typeof period === 'object' && period.type === 'custom') {
            overtimeData = { customOvertime: customOvertime || null };
        }

        const newRecord = await LeaveRecord.create({
            date,
            name,
            team,
            period,
            ...overtimeData
        });

        return NextResponse.json(newRecord);
    } catch (error) {
        console.error('Error creating leave record:', error);
        return NextResponse.json({ error: 'Failed to create leave record' }, { status: 500 });
    }
}

export async function PUT(request: Request) {
    try {
        await connectDB();

        const body = await request.json();
        const { date, name, period, overtime, customOvertime, ...restUpdateData } = body;

        // 建立更新物件
        const updateData = {
            ...restUpdateData,
            ...(period !== undefined && { period }),
            ...(overtime !== undefined && {
                overtime: {
                    ...overtime,
                    type: overtime?.type || '全天',
                    confirmed: overtime?.type === '全天' ? (overtime?.confirmed || false) : false,
                    firstConfirmed: overtime?.type === '半天' ? (overtime?.firstConfirmed || false) : false,
                    secondMember: overtime?.type === '半天' ? {
                        name: overtime?.secondMember?.name || '',
                        team: overtime?.secondMember?.team || '',
                        confirmed: overtime?.secondMember?.confirmed || false
                    } : null
                }
            }),
            ...(customOvertime !== undefined && { customOvertime })
        };

        const updatedRecord = await LeaveRecord.findOneAndUpdate(
            { date, name },
            updateData,
            { new: true }
        );

        if (!updatedRecord) {
            return NextResponse.json(
                { error: 'Leave record not found' },
                { status: 404 }
            );
        }

        return NextResponse.json(updatedRecord);
    } catch (error) {
        console.error('Error updating leave record:', error);
        return NextResponse.json({ error: 'Failed to update leave record' }, { status: 500 });
    }
}

export async function DELETE(request: Request) {
    try {
        const conn = await connectDB();
        console.log('MongoDB connected successfully');

        const data = await request.json();
        const { date, name } = data;

        const record = await LeaveRecord.findOneAndDelete({ date, name });

        if (!record) {
            return NextResponse.json({ error: 'Leave record not found' }, { status: 404 });
        }

        return NextResponse.json({ message: 'Leave record deleted successfully' });
    } catch (error: any) {
        console.error('MongoDB DELETE error:', error);
        return NextResponse.json({
            error: 'Failed to delete leave record',
            details: error?.message || 'Unknown error'
        }, { status: 500 });
    }
} 