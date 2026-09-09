import { MatchSnapshot } from './MatchTypes';
import { nicknameOf } from './SeatUtil';
import { ChallengeResult, Phase, SeatRole, TurnWindow } from './Phase';

function fill(tpl: string, snap: MatchSnapshot): string {
  let challenger: string = '';
  let accused: string = '';
  if (snap.challenge !== null) {
    challenger = nicknameOf(snap.seats, snap.challenge.challengerSeatId);
    if (snap.lastPlay !== null) {
      accused = nicknameOf(snap.seats, snap.lastPlay.actorSeatId);
    }
  }
  let named: string = '';
  if (snap.lastPlay !== null && snap.lastPlay.namedSeatId >= 0) {
    named = nicknameOf(snap.seats, snap.lastPlay.namedSeatId);
  }
  let winner: string = '';
  if (snap.winnerSeatId >= 0) {
    winner = nicknameOf(snap.seats, snap.winnerSeatId);
  }
  let nick: string = nicknameOf(snap.seats, snap.currentSeatId);
  if (nick.length === 0) {
    nick = '你';
  }
  let rank: string = '';
  if (snap.currentClaim !== null) {
    rank = snap.currentClaim.rank;
  }
  let n: string = '';
  if (snap.lastPlay !== null) {
    n = `${snap.lastPlay.count}`;
  }
  let lives: string = '';
  for (let i = 0; i < snap.seats.length; i++) {
    if (snap.seats[i].lastDelta < 0) {
      lives = `${snap.seats[i].lives}`;
      if (nick.length === 0 || snap.phase === Phase.PENALTY) {
        nick = snap.seats[i].nickname;
      }
    }
  }
  const sec: string = `${Math.ceil(snap.turnRemainMs / 1000)}`;
  let out: string = tpl;
  out = out.replace('{昵称}', nick);
  out = out.replace('{质疑者}', challenger);
  out = out.replace('{被质疑者}', accused);
  out = out.replace('{被点名}', named);
  out = out.replace('{胜者}', winner);
  out = out.replace('{rank}', rank);
  out = out.replace('{n}', n);
  out = out.replace('{命}', lives);
  out = out.replace('{秒}', sec);
  out = out.replace('{名}', named);
  return out;
}

function templateFor(key: string): string {
  if (key === 'lb_str_dlr_lobby_full') {
    return '本桌四人，酒已满。';
  }
  if (key === 'lb_str_dlr_deal') {
    return '发牌。每人 {n} 张。';
  }
  if (key === 'lb_str_dlr_claim') {
    return '本轮出 {rank}。{昵称} 先出。';
  }
  if (key === 'lb_str_dlr_turn_you') {
    return '轮到你。';
  }
  if (key === 'lb_str_dlr_turn_other') {
    return '轮到 {昵称}。';
  }
  if (key === 'lb_str_dlr_chal_only') {
    return '手牌空了。可以质疑上家这一手，也可以过。';
  }
  if (key === 'lb_str_dlr_chal_only_skip') {
    return '没开。过。';
  }
  if (key === 'lb_str_dlr_skip_empty') {
    return '{昵称} 没牌，过。';
  }
  if (key === 'lb_str_dlr_play') {
    return '{昵称} 出了 {n} 张。';
  }
  if (key === 'lb_str_dlr_play_named') {
    return '{昵称} 出了 {n} 张，点了 {被点名}。';
  }
  if (key === 'lb_str_dlr_auto_play') {
    return '{昵称} 超时，代出 1 张。';
  }
  if (key === 'lb_str_dlr_windup') {
    return '{质疑者} 开 {被质疑者} 这一手。';
  }
  if (key === 'lb_str_dlr_standoff') {
    return '押真假。不改谁掉命。';
  }
  if (key === 'lb_str_dlr_reveal') {
    return '翻上家这一手。';
  }
  if (key === 'lb_str_dlr_judge_success') {
    return '有假。{被质疑者} 掉 1 命。';
  }
  if (key === 'lb_str_dlr_judge_fail') {
    return '全真。{质疑者} 掉 1 命。';
  }
  if (key === 'lb_str_dlr_penalty_life') {
    return '{昵称} 还剩 {命} 命。';
  }
  if (key === 'lb_str_dlr_penalty_out') {
    return '{昵称} 出局，旁观看戏。';
  }
  if (key === 'lb_str_dlr_redeal') {
    return '一圈没人推进。不扣命，重新发牌。';
  }
  if (key === 'lb_str_dlr_recap') {
    return '{胜者} 留下。';
  }
  if (key === 'lb_str_dlr_hl_slam_caught') {
    return '{被质疑者} 第 {n} 手甩出后被拆穿。';
  }
  if (key === 'lb_str_dlr_hl_fail') {
    return '{质疑者} 开错了，自己掉命。';
  }
  if (key === 'lb_str_dlr_hl_fallback') {
    return '本局最险的一次质疑在第 {n} 手。';
  }
  return '';
}

export function lineForKey(key: string, snap: MatchSnapshot): string {
  return fill(templateFor(key), snap);
}

export function pickTurnDealerKey(snap: MatchSnapshot): string {
  if (snap.turnWindow === TurnWindow.CHALLENGE_ONLY) {
    return 'lb_str_dlr_chal_only';
  }
  const seat = snap.seats;
  for (let i = 0; i < seat.length; i++) {
    if (seat[i].seatId === snap.currentSeatId && seat[i].role === SeatRole.HUMAN) {
      return 'lb_str_dlr_turn_you';
    }
  }
  return 'lb_str_dlr_turn_other';
}

export function livePhaseText(snap: MatchSnapshot): string {
  if (snap.phase === Phase.TURN && snap.turnWindow === TurnWindow.CHALLENGE_ONLY) {
    return '可质疑';
  }
  if (snap.phase === Phase.TURN) {
    for (let i = 0; i < snap.seats.length; i++) {
      if (snap.seats[i].seatId === snap.currentSeatId && snap.seats[i].role === SeatRole.HUMAN) {
        return '轮到你出牌';
      }
    }
    return '等待出牌';
  }
  if (snap.phase === Phase.PLAY_REVEAL_SELF) {
    return '确认出牌';
  }
  if (snap.phase === Phase.CHALLENGE_RITUAL) {
    if (snap.ritualBeat === 'lb_challenge_windup') {
      return '起势';
    }
    if (snap.ritualBeat === 'lb_challenge_standoff') {
      return '对峙';
    }
    if (snap.ritualBeat === 'lb_challenge_reveal') {
      return '翻牌中';
    }
    return '定格';
  }
  if (snap.phase === Phase.JUDGE) {
    return '定格';
  }
  if (snap.phase === Phase.PENALTY) {
    return '结算命数';
  }
  if (snap.phase === Phase.DEAL) {
    if (snap.dealerKey === 'lb_str_dlr_redeal') {
      return '重新发牌';
    }
    return '发牌';
  }
  if (snap.phase === Phase.CLAIM) {
    return '新一轮';
  }
  return '';
}

export function liveClaimShort(snap: MatchSnapshot): string {
  if (snap.currentClaim === null) {
    return '';
  }
  return `出 ${snap.currentClaim.rank}`;
}

export function highlightFromLog(snap: MatchSnapshot): string {
  let slamCaught: boolean = false;
  let failHit: boolean = false;
  let playN: number = 0;
  for (let i = 0; i < snap.eventLog.length; i++) {
    const ev = snap.eventLog[i];
    if (ev.kind === 'PLAY' && ev.detail.indexOf('SLAM') >= 0) {
      playN = playN + 1;
    } else if (ev.kind === 'PLAY') {
      playN = playN + 1;
    }
    if (ev.kind === 'JUDGE' && ev.detail.indexOf(ChallengeResult.SUCCESS) >= 0 &&
      i > 0 && snap.eventLog[i - 1].kind === 'CHALLENGE') {
      slamCaught = slamCaught || (i >= 2 && snap.eventLog[i - 2].detail.indexOf('SLAM') >= 0);
    }
    if (ev.kind === 'JUDGE' && ev.detail.indexOf(ChallengeResult.FAIL) >= 0) {
      failHit = true;
    }
  }
  if (slamCaught) {
    return lineForKey('lb_str_dlr_hl_slam_caught', snap);
  }
  if (failHit) {
    return lineForKey('lb_str_dlr_hl_fail', snap);
  }
  return lineForKey('lb_str_dlr_hl_fallback', snap);
}
