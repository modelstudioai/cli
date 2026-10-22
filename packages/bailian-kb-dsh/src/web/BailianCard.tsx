/**
 * Bailian knowledge-base plugin page. Workspace and default services are
 * volatile plugin config. The API key stays in dsh credentials.
 */

import type { PluginConfigViewProps } from "@deepseek-ai/dsh-client-ui-plugin-manager/client";
import type { InjectFace, PropsLocale } from "@deepseek-ai/dsh-client-ui-slots";
import { SettingsForm } from "@deepseek-ai/dsh-client-ui-primitives";
import type {
  BailianCardFace,
  BailianCardState,
  ServiceEntryView,
} from "./bailian-card-controller.ts";
import { formLabels, type BailianKbLocaleKey } from "./locales.ts";
import css from "./BailianCard.module.css";

export type BailianCardProps = PluginConfigViewProps &
  PropsLocale<"settings.bailianKb"> &
  InjectFace<BailianCardFace>;

const API_KEY_URL = "https://bailian.console.aliyun.com/cn-beijing?tab=globalset#/efm/api_key";

function credentialLabel(t: (key: BailianKbLocaleKey) => string, state: BailianCardState): string {
  if (!state.apiKey.configured) return t("apiKeyUnset");
  if (!state.apiKey.writable) return t("fromEnv");
  return t("apiKeySet");
}

export function BailianCard(props: BailianCardProps) {
  const { t } = props;
  const state = props.useBailianCard((snapshot) => snapshot);
  if (props.view === "summary") return t("description");
  const login = state.consoleLogin;

  const renderPicker = (scene: "search" | "chat", entries: ServiceEntryView[]) => {
    const field = scene === "search" ? state.defaultRetrieveAgentId : state.defaultChatAgentId;
    const fieldName = scene === "search" ? "defaultRetrieveAgentId" : "defaultChatAgentId";
    const pinned = field.text;
    const listed = entries.some((entry) => entry.agent_id === pinned);
    return (
      <div className={css.field}>
        <div className={css.head}>
          <span className={css.label}>
            {t(scene === "search" ? "retrieveAgentId" : "chatAgentId")}
          </span>
          {pinned ? (
            <button
              type="button"
              className={css.clear}
              disabled={!state.writable}
              onClick={() => props.edit(fieldName, "")}
            >
              {t("pickerClear")}
            </button>
          ) : null}
        </div>
        <select
          className={css.input}
          value={pinned}
          disabled={!state.writable || state.cache.status !== "ready"}
          onChange={(event) => props.edit(fieldName, event.target.value)}
        >
          <option value="">{t("pickerNone")}</option>
          {pinned && !listed ? <option value={pinned}>{pinned}</option> : null}
          {entries.map((entry) => (
            <option key={entry.agent_id} value={entry.agent_id}>
              {entry.agent_name === "" ? entry.agent_id : entry.agent_name}
            </option>
          ))}
        </select>
        <p className={css.hint}>
          {entries.length === 0
            ? t("cacheEmpty")
            : t(scene === "search" ? "retrieveAgentIdHint" : "chatAgentIdHint")}
        </p>
      </div>
    );
  };

  const ready = state.apiKey.configured && state.workspaceDraft.trim() !== "";
  const cache = state.cache;
  const fetched =
    cache.fetchedAt === undefined ? t("cacheNever") : new Date(cache.fetchedAt).toLocaleString();

  return (
    <div className={css.root}>
      <section className={css.card} aria-labelledby="bailian-kb-overview-heading">
        <div className={css.sectionHeading}>
          <div>
            <h2 id="bailian-kb-overview-heading">{t("overviewTitle")}</h2>
            <p>{t("overviewHint")}</p>
          </div>
          <span className={`${css.status} ${ready ? css.statusReady : css.statusSetup}`}>
            {t(ready ? "overviewReady" : "overviewSetup")}
          </span>
        </div>
        <p className={css.callout}>{t("overviewBody")}</p>
      </section>
      <section className={css.card} aria-labelledby="bailian-kb-connection-heading">
        <div className={css.sectionHeading}>
          <div>
            <h2 id="bailian-kb-connection-heading">{t("connectionTitle")}</h2>
            <p>{t("connectionSectionHint")}</p>
          </div>
        </div>
        <div className={css.autofillRow}>
          <button
            type="button"
            className={css.discard}
            disabled={
              !state.apiKey.writable ||
              state.connectionBusy ||
              login?.phase === "waiting" ||
              login?.phase === "awaitingLogin"
            }
            onClick={() => void props.beginConsoleLogin()}
          >
            {t(
              login?.phase === "waiting" || login?.phase === "awaitingLogin"
                ? "autofillAwaitingLogin"
                : "autofill",
            )}
          </button>
          <span className={login?.phase === "done" ? css.autofillNoticeSuccess : css.hint}>
            {login?.phase === "done"
              ? t("autofillDone")
              : login?.phase === "failed"
                ? t("autofillFailed")
                : state.apiKey.configured
                  ? t("autofillConfigured")
                  : t("autofillHint")}
            {login?.loginUrl ? (
              <>
                {" "}
                <a href={login.loginUrl} target="_blank" rel="noreferrer">
                  {t("autofillOpenUrl")}
                </a>
              </>
            ) : null}
          </span>
        </div>
        <label className={css.field} htmlFor="bailian-kb-key">
          <div className={css.head}>
            <span className={css.labelWrap}>
              <span className={css.label}>{t("apiKey")}</span>
              <a className={css.getLink} href={API_KEY_URL} target="_blank" rel="noreferrer">
                {t("apiKeyGet")}
              </a>
            </span>
            <span className={state.apiKey.configured ? css.badgeSuccess : css.badgeMuted}>
              {credentialLabel(t, state)}
            </span>
          </div>
          <input
            id="bailian-kb-key"
            type="password"
            className={css.input}
            autoComplete="new-password"
            value={state.apiKeyDraft}
            disabled={!state.apiKey.writable || state.connectionBusy}
            placeholder={t("keyPlaceholder")}
            onChange={(event) => props.setApiKeyDraft(event.target.value)}
          />
          <p className={css.hint}>{t("privateKeyHint")}</p>
        </label>
        <label className={css.field} htmlFor="bailian-kb-workspace">
          <span className={css.label}>{t("workspaceId")}</span>
          <input
            id="bailian-kb-workspace"
            className={css.input}
            value={state.workspaceDraft}
            disabled={!state.writable || state.connectionBusy}
            placeholder="ws-..."
            onChange={(event) => props.setWorkspaceDraft(event.target.value)}
          />
          <p className={css.hint}>{t("connectionHint")}</p>
        </label>
        <button
          type="button"
          className={css.discard}
          disabled={!state.writable || state.connectionBusy || !state.workspaceDraft.trim()}
          onClick={() => void props.saveConnection()}
        >
          {t(state.connectionBusy ? "saving" : "saveConnection")}
        </button>
        {state.message ? <p className={css.notice}>{state.message}</p> : null}
      </section>

      <section className={css.card} aria-labelledby="bailian-kb-services-heading">
        <SettingsForm
          labels={formLabels(t)}
          state={state}
          onSave={props.save}
          onDiscard={props.discard}
        >
          <div className={css.sectionHeading}>
            <div>
              <h2 id="bailian-kb-services-heading">{t("servicesTitle")}</h2>
              <p>{t("servicesHint")}</p>
            </div>
          </div>
          {renderPicker("search", cache.search)}
          {renderPicker("chat", cache.chat)}
        </SettingsForm>
      </section>

      <section className={css.card} aria-labelledby="bailian-kb-cache-heading">
        <div className={css.sectionHeading}>
          <div>
            <h2 id="bailian-kb-cache-heading">{t("cacheTitle")}</h2>
            <p>{t("cacheHint")}</p>
          </div>
          <button
            type="button"
            className={css.clear}
            disabled={cache.refreshing}
            onClick={() => void props.refreshServices()}
          >
            {t(cache.refreshing ? "cacheRefreshing" : "cacheRefresh")}
          </button>
        </div>
        {cache.status === "loading" ? <p className={css.hint}>{t("cacheLoading")}</p> : null}
        {cache.status === "unconfigured" ? (
          <p className={css.notice}>{t("cacheUnconfigured")}</p>
        ) : null}
        {cache.status === "unavailable" ? (
          <p className={css.notice}>{t("cacheUnavailable")}</p>
        ) : null}
        {cache.status === "ready" ? (
          <p className={css.hint}>
            {t("cacheFetchedAt")}: {fetched}
            {cache.stale ? ` (${t("cacheStale")})` : ""}
            {" · "}
            {t("cacheSearchCount")}: {cache.searchCount}
            {" · "}
            {t("cacheChatCount")}: {cache.chatCount}
          </p>
        ) : null}
        {cache.truncated ? <p className={css.notice}>{t("cacheTruncated")}</p> : null}
      </section>
    </div>
  );
}
