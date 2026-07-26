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

// 표준 5필드 cron → EventBridge 6필드 cron 변환
// 표준: min hour dom month dow (0=Sun)
// EventBridge: min hour dom month dow year (SUN-SAT, dom/dow 중 하나는 반드시 ?)
function toEventBridgeCron(cron: string): string {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) throw new Error(`지원하지 않는 cron 형식 (5필드 필요): ${cron}`);

  const DOW_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

  const convertDow = (dow: string) =>
    dow.replace(/\b([0-6])\b/g, (_, n: string) => DOW_NAMES[parseInt(n)] ?? n);

  const [min, hour, dom, month, dow] = parts as [string, string, string, string, string];

  // dom과 dow 둘 다 *가 아니면 dom 우선, dow=? 처리
  let ebDom = dom;
  let ebDow: string;

  if (dom === '*' && dow !== '*') {
    ebDom = '?';
    ebDow = convertDow(dow);
  } else if (dom !== '*') {
    ebDow = '?';
  } else {
    // 둘 다 * → dow=? 처리
    ebDow = '?';
  }

  return `${min} ${hour} ${ebDom} ${month} ${ebDow} *`;
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
