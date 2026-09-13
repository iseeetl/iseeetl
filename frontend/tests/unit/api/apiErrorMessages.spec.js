import { expect } from 'vitest';
import {
  DEFAULT_API_ERROR_TRANSLATION_KEY,
  resolveApiErrorTranslationKey,
} from '@/api/apiErrorMessages';

describe('APIエラーメッセージ', () => {
  it('入力・認証・メンバー管理のコードを利用者向け文言へ変換する', () => {
    expect(resolveApiErrorTranslationKey('INVALID_PARAMS')).to.equal('入力内容が正しくありません。');
    expect(resolveApiErrorTranslationKey('NO_UPDATABLE_FIELD')).to.equal(
      '変更する項目を指定してください。'
    );
    expect(resolveApiErrorTranslationKey('FORBIDDEN')).to.equal(
      'この操作を行う権限がありません。'
    );
    expect(resolveApiErrorTranslationKey('TOKEN_INVALID')).to.equal('認証情報が無効です。');
    expect(resolveApiErrorTranslationKey('USER_ALREADY_EXISTS')).to.equal(
      'このメールアドレスは既に登録されています。'
    );
    expect(resolveApiErrorTranslationKey('USER_EMAIL_ALREADY_USED')).to.equal(
      'このメールアドレスは既に登録されています。'
    );
    expect(resolveApiErrorTranslationKey('SIGNUP_TOKEN_EXPIRED')).to.equal(
      '仮登録の有効期限が切れました。もう一度ユーザー登録を行ってください。'
    );
    expect(resolveApiErrorTranslationKey('DONT_NEED_FLOOR_MEMBER')).to.equal(
      'フロア編集者はフロアメンバーとして登録する必要はありません。'
    );
    expect(resolveApiErrorTranslationKey('ALREADY_FLOOR_MEMBER')).to.equal(
      '既にフロアメンバーです。'
    );
    expect(resolveApiErrorTranslationKey('ALREADY_ROOM_MEMBER')).to.equal(
      '既にルームメンバーです。'
    );
    expect(resolveApiErrorTranslationKey('ALREADY_KICKED')).to.equal(
      'このユーザーは既にアクセスを制限されています。'
    );
  });

  it('AI解析設定の有効な参照を削除できない理由へ変換する', () => {
    expect(
      resolveApiErrorTranslationKey('CONFLICT', {
        reason: 'ACTIVE_AI_ANALYSIS_REFERENCE',
        resource_type: 'category-tag',
      }, 409)
    ).to.equal(
      '有効なAI解析設定で使用されているため削除できません。先に関連するAI解析設定を削除してください'
    );
  });

  it('汎用のCONFLICTや未知の理由には共通メッセージを使う', () => {
    expect(resolveApiErrorTranslationKey('CONFLICT')).to.equal(DEFAULT_API_ERROR_TRANSLATION_KEY);
    expect(
      resolveApiErrorTranslationKey('CONFLICT', { reason: 'UNKNOWN_REASON' }, 409)
    ).to.equal(DEFAULT_API_ERROR_TRANSLATION_KEY);
  });

  it('HTTP 409以外では理由を具体的な案内へ変換しない', () => {
    expect(
      resolveApiErrorTranslationKey(
        'CONFLICT',
        {
          reason: 'ACTIVE_AI_ANALYSIS_REFERENCE',
          resource_type: 'category-tag',
        },
        400
      )
    ).to.equal(DEFAULT_API_ERROR_TRANSLATION_KEY);
  });

  it('CONFLICT以外では理由よりエラーコードに対応するメッセージを優先する', () => {
    expect(
      resolveApiErrorTranslationKey('VALIDATION_ERROR', {
        reason: 'ACTIVE_AI_ANALYSIS_REFERENCE',
      })
    ).to.equal('入力を確認してください');
  });
});
