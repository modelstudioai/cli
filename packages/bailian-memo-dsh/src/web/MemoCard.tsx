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

function credentialSourceKey(
  source: MemoCardState["apiKey"]["source"],
):
  | "apiKeySourceEnvironment"
  | "apiKeySourceLocal"
  | "apiKeySourceProjectEnvironment"
  | "apiKeySourceUserEnvironment"
  | undefined {
  if (source === "environment") return "apiKeySourceEnvironment";
  if (source === "local") return "apiKeySourceLocal";
  if (source === "projectEnvironment") return "apiKeySourceProjectEnvironment";
  if (source === "userEnvironment") return "apiKeySourceUserEnvironment";
  return undefined;
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
  field: keyof Pick<MemoPluginSettings, "enabled" | "autoRecall" | "autoCurate">;
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
          checked={props.state.text !== "false"}
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
  const sourceKey = credentialSourceKey(state.apiKey.source);
  const credentialStatus = state.apiKey.configured
    ? `${t("apiKeyConfigured")}${sourceKey ? ` · ${t(sourceKey)}` : ""}`
    : t("apiKeyMissing");
  const autofillStatus = state.consoleLoginStatus;
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
        <div className={css.factGrid}>
          <span>{t("apiKey")}</span>
          <strong>{credentialStatus}</strong>
        </div>
        {!state.apiKey.writable ? (
          <div className={css.message} role="alert">
            {t("environmentOverrideGuidance")}
          </div>
        ) : null}
        <label className={css.inputGroup} htmlFor="bailian-memo-workspace">
          <span>{t("workspace")}</span>
          <input
            id="bailian-memo-workspace"
            className={css.input}
            value={state.workspaceDraft}
            disabled={!canEnable || state.busy}
            onChange={(event) => props.setWorkspaceDraft(event.target.value)}
            placeholder="ws-..."
          />
          <small>{canEnable ? t("workspaceHint") : t("workspaceLockedHint")}</small>
        </label>
        <div className={css.actions}>
          <button
            type="button"
            className={css.secondaryButton}
            disabled={state.busy || !state.apiKey.writable}
            onClick={() => void props.consoleLogin()}
          >
            {t("consoleLogin")}
          </button>
          {canEnable ? (
            <button
              type="button"
              className={css.primaryButton}
              disabled={state.busy || !state.workspaceDraft.trim()}
              onClick={() => void props.enable()}
            >
              {t("enable")}
            </button>
          ) : null}
        </div>
        {autofillStatus?.phase === "waiting" ? (
          <div className={css.flowStatus} role="status">
            {t("loginWaiting")}
          </div>
        ) : null}
        {autofillStatus?.phase === "done" ? (
          <div className={css.flowStatus} role="status">
            {t("loginDone")}
          </div>
        ) : null}
        {autofillStatus?.phase === "failed" ? (
          <div className={css.message} role="alert">
            {t("loginFailed")}
            {autofillStatus.reason ? `: ${autofillStatus.reason}` : ""}
          </div>
        ) : null}
        {state.message ? (
          <div className={css.message} role="alert">
            {state.message}
          </div>
        ) : null}
      </section>

      <SettingsForm
        labels={formLabels(t)}
        state={state}
        onSave={props.save}
        onDiscard={props.discard}
      >
        <section className={css.section} aria-labelledby="bailian-memo-automatic-heading">
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
        </section>
      </SettingsForm>

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
          <span>{t("profileSchema")}</span>
          <code>{personal?.profile_schema_id ?? "—"}</code>
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
