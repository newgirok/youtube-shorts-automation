import {
  EventBridgeClient,
  PutRuleCommand,
  PutTargetsCommand,
  RemoveTargetsCommand,
  DeleteRuleCommand,
} from '@aws-sdk/client-eventbridge';
import { createLogger } from '@shorts/shared';

const eb = new EventBridgeClient({ region: process.env.AWS_REGION ?? 'ap-northeast-2' });
const log = createLogger({});

const SCHEDULER_LAMBDA_ARN = process.env.SCHEDULER_LAMBDA_ARN!;

// 표준 5필드 cron(KST) → EventBridge 6필드 cron(UTC) 변환
// 표준: min hour dom month dow (0=Sun)
// EventBridge: min hour dom month dow year (SUN-SAT, dom/dow 중 하나는 반드시 ?)
// EventBridge는 UTC 기준이므로 KST 시간에서 9시간을 뺀다.
// KST 00:00~08:59 → 자정을 넘겨 UTC 전날 15:00~23:59 → 주간 스케줄의 요일도 하루 앞으로 조정
function toEventBridgeCron(cron: string): string {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) throw new Error(`지원하지 않는 cron 형식 (5필드 필요): ${cron}`);

  const DOW_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const KST_OFFSET = 9;

  const convertDow = (dow: string) =>
    dow.replace(/\b([0-6])\b/g, (_, n: string) => DOW_NAMES[parseInt(n)] ?? n);

  const [min, hour, dom, month, dow] = parts as [string, string, string, string, string];

  // KST → UTC 시간 변환 (hour='*'인 매시간 스케줄은 변환 불필요)
  let ebHour = hour;
  let adjustedDow = dow;
  if (hour !== '*') {
    const kstHour = parseInt(hour, 10);
    const utcHour = (kstHour - KST_OFFSET + 24) % 24;
    ebHour = String(utcHour);
    // KST 시간이 09:00 미만이면 UTC로 변환 시 전날이 됨 → 주간 스케줄 요일 하루 앞으로 조정
    if (kstHour < KST_OFFSET && dom === '*' && dow !== '*') {
      adjustedDow = dow.replace(/\b([0-6])\b/g, (_, n: string) => String((parseInt(n, 10) - 1 + 7) % 7));
    }
  }

  // dom과 dow 둘 다 *가 아니면 dom 우선, dow=? 처리
  let ebDom = dom;
  let ebDow: string;

  if (dom === '*' && adjustedDow !== '*') {
    ebDom = '?';
    ebDow = convertDow(adjustedDow);
  } else if (dom !== '*') {
    ebDow = '?';
  } else {
    // 둘 다 * → dow=? 처리
    ebDow = '?';
  }

  return `${min} ${ebHour} ${ebDom} ${month} ${ebDow} *`;
}

export async function createChannelRule(channelId: string, cronExpr: string): Promise<string> {
  const ruleName = `shorts-channel-${channelId}-scheduler`;
  const ebCron = toEventBridgeCron(cronExpr);

  const putResult = await eb.send(
    new PutRuleCommand({
      Name: ruleName,
      ScheduleExpression: `cron(${ebCron})`,
      State: 'ENABLED',
      Description: `채널 ${channelId} 자동 Job 생성 스케줄`,
    }),
  );

  await eb.send(
    new PutTargetsCommand({
      Rule: ruleName,
      Targets: [
        {
          Id: `channel-${channelId}`,
          Arn: SCHEDULER_LAMBDA_ARN,
          Input: JSON.stringify({ channelId }),
        },
      ],
    }),
  );

  log.info({ channelId, ruleName, ebCron }, 'EventBridge 규칙 생성 완료');
  return putResult.RuleArn!;
}

export async function deleteChannelRule(channelId: string): Promise<void> {
  const ruleName = `shorts-channel-${channelId}-scheduler`;
  try {
    await eb.send(
      new RemoveTargetsCommand({ Rule: ruleName, Ids: [`channel-${channelId}`] }),
    );
    await eb.send(new DeleteRuleCommand({ Name: ruleName }));
    log.info({ channelId, ruleName }, 'EventBridge 규칙 삭제 완료');
  } catch (err) {
    // 규칙이 이미 없는 경우 무시
    log.warn({ channelId, ruleName, err }, 'EventBridge 규칙 삭제 스킵 (미존재)');
  }
}
