/**
 * Bailian personal-memory settings page (Plugins item).
 */

import type { PluginConfigViewProps } from "@deepseek-ai/dsh-client-ui-plugin-manager/client";
import { SettingsForm, SettingsValueField, Switch } from "@deepseek-ai/dsh-client-ui-primitives";
import type { InjectFace, PropsLocale } from "@deepseek-ai/dsh-client-ui-slots";
import type { MemoCardFace, MemoCardState, MemoPluginSettings } from "./memo-card-controller.ts";
import { isWorkspaceEndpointAccessDenied } from "./config-ux-model.ts";
import { formLabels, type MemoSettingsLocaleKey } from "./locales.ts";
import css from "./MemoCard.module.css";

export type MemoCardProps = PluginConfigViewProps &
  PropsLocale<"settings.bailianMemo"> &
  InjectFace<MemoCardFace>;

const API_KEY_URL = "https://bailian.console.aliyun.com/cn-beijing?tab=globalset#/efm/api_key";

function credentialLabel(t: (key: MemoSettingsLocaleKey) => string, state: MemoCardState): string {
  if (!state.apiKey.configured) return t("apiKeyUnset");
  if (!state.apiKey.writable) return t("fromEnv");
  return t("apiKeySet");
}

function taskStatusKey(status: string): MemoSettingsLocaleKey {
  if (status === "pending_submit") return "taskPendingSubmit";
  if (status === "submitted") return "taskSubmitted";
  if (status === "polling") return "taskPolling";
  if (status === "succeeded_with_change") return "taskSucceededWithChange";
  if (status === "succeeded_no_change") return "taskSucceededNoChange";
  if (status === "succeeded") return "taskSucceededLegacy";
  if (status === "failed") return "taskFailed";
  return "taskAbandoned";
}

interface ToggleSettingProps {
  field: keyof Pick<MemoPluginSettings, "enabled" | "autoRecall" | "autoCurate" | "extractProfile">;
  label: string;
  hint: string;
  state: MemoCardState["enabled"];
  writable: boolean;
  overriddenLabel: string;
  resetLabel: string;
  edit: MemoCardProps["edit"];
  resetField: MemoCardProps["resetField"];
}

function ToggleSetting(props: ToggleSettingProps) {
  return (
    <div className={css.settingRow}>
      <div className={css.settingCopy}>
        <div className={css.settingTitle}>
          <span>{props.label}</span>
          {props.state.overridden ? (
            <span className={css.overridden}>{props.overriddenLabel}</span>
          ) : null}
        </div>
        <span className={css.hint}>{props.hint}</span>
      </div>
      <div className={css.settingControl}>
        {props.state.overridden ? (
          <button
            type="button"
            className={css.resetButton}
            disabled={!props.writable}
            onClick={() => props.resetField(props.field)}
          >
            {props.resetLabel}
          </button>
        ) : null}
        <Switch
          checked={
            props.field === "extractProfile"
              ? props.state.text === "true"
              : props.state.text !== "false"
          }
          onChange={(next) => props.edit(props.field, String(next))}
          label={props.label}
          disabled={!props.writable}
        />
      </div>
    </div>
  );
}

export function MemoCard(props: MemoCardProps) {
  const { t } = props;
  const state = props.useMemoCard((snapshot) => snapshot);
  if (props.view === "summary") return t("subtitle");

  const personal = state.personal;
  const canEnable =
    !personal || personal.status === "unconfigured" || personal.status === "initializing";
  const canPause = personal?.status === "active";
  const canResume = personal?.status === "paused";
  const autofillStatus = state.consoleLoginStatus;
  const loginWaiting = autofillStatus?.phase === "waiting";
  return (
    <div className={css.root}>
      <section className={css.section} aria-labelledby="bailian-memo-status-heading">
        <div className={css.sectionHeading}>
          <div>
            <h2 id="bailian-memo-status-heading">{t("onboardingTitle")}</h2>
            <p>{t("onboardingHint")}</p>
          </div>
          <span className={`${css.status} ${css[state.memoryState]}`}>{t(state.memoryState)}</span>
        </div>
        <p className={css.consent}>{t("consent")}</p>
        {personal?.last_error ? (
          <div className={css.message} role="alert">
            {t("lastError")}: {personal.last_error}
            {isWorkspaceEndpointAccessDenied(personal.last_error) ? (
              <div>{t("workspaceAccessDeniedGuidance")}</div>
            ) : null}
          </div>
        ) : null}
        <div className={css.actions}>
          {canPause ? (
            <button
              type="button"
              className={css.dangerButton}
              disabled={state.busy}
              onClick={() => void props.pause()}
            >
              {t("pause")}
            </button>
          ) : null}
          {canResume ? (
            <button
              type="button"
              className={css.primaryButton}
              disabled={state.busy}
              onClick={() => void props.resume()}
            >
              {t("resume")}
            </button>
          ) : null}
        </div>
      </section>

      <section className={css.section} aria-labelledby="bailian-memo-connection-heading">
        <div className={css.sectionHeading}>
          <div>
            <h2 id="bailian-memo-connection-heading">{t("connectionTitle")}</h2>
            <p>{t("connectionHint")}</p>
          </div>
          <button
            type="button"
            className={css.secondaryButton}
            disabled={state.busy}
            onClick={() => void props.refresh()}
          >
            {t("refresh")}
          </button>
        </div>
        <div className={css.autofillRow}>
          <button
            type="button"
            className={css.secondaryButton}
            disabled={state.busy || !state.apiKey.writable || loginWaiting}
            onClick={() => void props.consoleLogin()}
          >
            {t(loginWaiting ? "loginWaiting" : "consoleLogin")}
          </button>
          <span
            className={
              autofillStatus?.phase === "done" ? css.autofillStatusSuccess : css.autofillStatus
            }
          >
            {autofillStatus?.phase === "done"
              ? t("loginDone")
              : autofillStatus?.phase === "failed"
                ? `${t("loginFailed")}${autofillStatus.reason ? `: ${autofillStatus.reason}` : ""}`
                : autofillStatus?.phase === "waiting"
                  ? t("loginWaiting")
                  : state.apiKey.configured
                    ? t("autofillConfigured")
                    : t("autofillHint")}
          </span>
        </div>
        {!state.apiKey.writable ? (
          <div className={css.message} role="alert">
            {t("environmentOverrideGuidance")}
          </div>
        ) : null}
        <label className={css.inputGroup} htmlFor="bailian-memo-api-key">
          <span className={css.fieldHead}>
            <span className={css.fieldTitle}>
              <span>{t("apiKey")}</span>
              <a className={css.getLink} href={API_KEY_URL} target="_blank" rel="noreferrer">
                {t("apiKeyGet")}
              </a>
            </span>
            <span className={state.apiKey.configured ? css.badge : css.badgeMuted}>
              {credentialLabel(t, state)}
            </span>
          </span>
          <input
            id="bailian-memo-api-key"
            className={css.input}
            type="password"
            autoComplete="new-password"
            value={state.apiKeyDraft}
            disabled={state.busy || !state.apiKey.writable}
            onChange={(event) => props.setApiKeyDraft(event.target.value)}
            placeholder={t("apiKeyPlaceholder")}
          />
          <small>{t("privateKeyHint")}</small>
        </label>
        <label className={css.inputGroup} htmlFor="bailian-memo-workspace">
          <span>{t("workspace")}</span>
          <input
            id="bailian-memo-workspace"
            className={css.input}
            value={state.workspaceDraft}
            disabled={!state.writable || state.busy}
            onChange={(event) => props.setWorkspaceDraft(event.target.value)}
            placeholder="ws-..."
          />
          <small>{t("workspaceHint")}</small>
        </label>
        <div className={css.actions}>
          <button
            type="button"
            className={css.primaryButton}
            disabled={state.busy || !state.writable || !state.workspaceDraft.trim()}
            onClick={() => void props.saveConnection()}
          >
            {t("saveConnection")}
          </button>
          {canEnable ? (
            <button
              type="button"
              className={css.secondaryButton}
              disabled={state.busy || !state.workspaceDraft.trim() || Boolean(state.apiKeyDraft)}
              onClick={() => void props.enable()}
            >
              {t("enable")}
            </button>
          ) : null}
        </div>
        {state.message ? (
          <div className={css.message} role="alert">
            {state.message}
          </div>
        ) : null}
      </section>

      <section className={css.section} aria-labelledby="bailian-memo-automatic-heading">
        <SettingsForm
          labels={formLabels(t)}
          state={state}
          onSave={props.save}
          onDiscard={props.discard}
        >
          <div className={css.sectionHeading}>
            <div>
              <h2 id="bailian-memo-automatic-heading">{t("automaticTitle")}</h2>
              <p>{t("automaticHint")}</p>
            </div>
          </div>
          <ToggleSetting
            field="enabled"
            label={t("automaticEnabled")}
            hint={t("automaticEnabledHint")}
            state={state.enabled}
            writable={state.writable}
            overriddenLabel={t("overridden")}
            resetLabel={t("reset")}
            edit={props.edit}
            resetField={props.resetField}
          />
          <ToggleSetting
            field="autoRecall"
            label={t("autoRecall")}
            hint={t("autoRecallHint")}
            state={state.autoRecall}
            writable={state.writable}
            overriddenLabel={t("overridden")}
            resetLabel={t("reset")}
            edit={props.edit}
            resetField={props.resetField}
          />
          <ToggleSetting
            field="autoCurate"
            label={t("autoCurate")}
            hint={t("autoCurateHint")}
            state={state.autoCurate}
            writable={state.writable}
            overriddenLabel={t("overridden")}
            resetLabel={t("reset")}
            edit={props.edit}
            resetField={props.resetField}
          />
          <ToggleSetting
            field="extractProfile"
            label={t("extractProfile")}
            hint={t("extractProfileHint")}
            state={state.extractProfile}
            writable={state.writable}
            overriddenLabel={t("overridden")}
            resetLabel={t("reset")}
            edit={props.edit}
            resetField={props.resetField}
          />
          {state.extractProfile.text === "true" ? (
            <div className={css.inputGroup}>
              <label htmlFor="bailian-memo-profile-schema">{t("profileSchema")}</label>
              <select
                id="bailian-memo-profile-schema"
                className={css.input}
                value={state.profileSchemaId.text || state.profileSchemas.at(-1)?.id || ""}
                disabled={!state.writable || state.profileSchemasLoading}
                onChange={(event) => props.edit("profileSchemaId", event.target.value)}
              >
                {state.profileSchemas.length === 0 ? (
                  <option value="">
                    {t(
                      state.profileSchemasLoading ? "profileSchemasLoading" : "profileSchemasEmpty",
                    )}
                  </option>
                ) : null}
                {state.profileSchemaId.text &&
                !state.profileSchemas.some((schema) => schema.id === state.profileSchemaId.text) ? (
                  <option value={state.profileSchemaId.text}>
                    {t("profileSchemaUnavailable")}: {state.profileSchemaId.text}
                  </option>
                ) : null}
                {state.profileSchemas.map((schema) => (
                  <option key={schema.id} value={schema.id}>
                    {schema.name} · {schema.id}
                  </option>
                ))}
              </select>
              <small>{t("profileSchemaHint")}</small>
              <button
                type="button"
                className={css.secondaryButton}
                disabled={state.profileSchemasLoading}
                onClick={() => void props.refreshProfileSchemas()}
              >
                {t("refresh")}
              </button>
              {state.profileSchemasError ? (
                <p className={css.message} role="alert">
                  {state.profileSchemasError}
                </p>
              ) : null}
            </div>
          ) : null}
          <SettingsValueField
            id="bailian-memo-recall-top-k"
            label={t("recallTopK")}
            hint={t("recallTopKHint")}
            numeric
            placeholder="5"
            overriddenLabel={t("overridden")}
            resetLabel={t("reset")}
            invalidLabel={t("invalidNumber")}
            disabled={!state.writable}
            {...state.recallTopK}
            onEdit={(text) => props.edit("recallTopK", text)}
            onReset={() => props.resetField("recallTopK")}
          />
          <SettingsValueField
            id="bailian-memo-min-score"
            label={t("minScore")}
            hint={t("minScoreHint")}
            placeholder="0"
            overriddenLabel={t("overridden")}
            resetLabel={t("reset")}
            invalidLabel={t("invalidScore")}
            disabled={!state.writable}
            {...state.minScore}
            onEdit={(text) => props.edit("minScore", text)}
            onReset={() => props.resetField("minScore")}
          />
        </SettingsForm>
      </section>

      <section className={css.section} aria-labelledby="bailian-memo-identity-heading">
        <div className={css.sectionHeading}>
          <div>
            <h2 id="bailian-memo-identity-heading">{t("identityTitle")}</h2>
            <p>{t("identityHint")}</p>
          </div>
        </div>
        <div className={css.factGrid}>
          <span>{t("userId")}</span>
          <code>{personal?.user_id ?? "—"}</code>
          <span>{t("consentedAt")}</span>
          <code>{personal?.consented_at ?? "—"}</code>
        </div>
      </section>

      <section className={css.section} aria-labelledby="bailian-memo-privacy-heading">
        <div className={css.sectionHeading}>
          <div>
            <h2 id="bailian-memo-privacy-heading">{t("privacyTitle")}</h2>
            <p>{t("privacyPolicy")}</p>
          </div>
        </div>
      </section>

      <section className={css.section} aria-labelledby="bailian-memo-tasks-heading">
        <div className={css.sectionHeading}>
          <div>
            <h2 id="bailian-memo-tasks-heading">{t("diagnosticsTitle")}</h2>
            <p>{t("diagnosticsHint")}</p>
          </div>
        </div>
        <div className={css.tasks}>
          {state.recentTasks.length === 0
            ? t("noRecentTasks")
            : state.recentTasks.map((task) => (
                <div className={css.task} key={task.intentId}>
                  <strong>{t(taskStatusKey(task.status))}</strong>
                  <span>{task.updatedAt}</span>
                  {task.resultCount !== undefined ? (
                    <span>
                      {t("taskResultCount")}: {task.resultCount}
                      {task.resultEventTypes?.length
                        ? ` (${task.resultEventTypes.join(", ")})`
                        : ""}
                    </span>
                  ) : null}
                  {task.lastError ? <span className={css.taskError}>{task.lastError}</span> : null}
                </div>
              ))}
        </div>
      </section>
    </div>
  );
}
