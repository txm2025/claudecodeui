import { useTranslation } from "react-i18next";
import { ReleaseInfo } from "../../../types/sharedTypes";
import type { InstallMode } from "../../../hooks/useVersionCheck";

interface VersionUpgradeModalProps {
    isOpen: boolean;
    onClose: () => void;
    releaseInfo: ReleaseInfo | null;
    currentVersion: string;
    latestVersion: string | null;
    installMode: InstallMode;
}

export function VersionUpgradeModal({
    isOpen,
    onClose,
    releaseInfo,
    currentVersion,
    latestVersion,
}: VersionUpgradeModalProps) {
    const { t } = useTranslation('common');

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <button
                className="fixed inset-0 bg-black/50 backdrop-blur-sm"
                onClick={onClose}
                aria-label={t('versionUpdate.ariaLabels.closeModal')}
            />

            {/* Modal */}
            <div className="relative mx-4 max-h-[90vh] w-full max-w-2xl space-y-4 overflow-y-auto rounded-md border border-border bg-card p-6 text-card-foreground">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-md border border-border/60 bg-muted">
                            <svg className="h-4 w-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                            </svg>
                        </div>
                        <div>
                            <h2 className="text-base font-semibold text-foreground">{t('versionUpdate.title')}</h2>
                            <p className="text-xs text-muted-foreground">
                                {releaseInfo?.title || t('versionUpdate.newVersionReady')}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Version Info */}
                <div className="space-y-2">
                    <div className="flex items-center justify-between rounded-md border border-border/60 bg-muted/40 px-3 py-2">
                        <span className="text-xs font-medium text-muted-foreground">{t('versionUpdate.currentVersion')}</span>
                        <span className="font-mono text-xs text-foreground">{currentVersion}</span>
                    </div>
                    <div className="flex items-center justify-between rounded-md border border-primary/30 bg-primary/10 px-3 py-2">
                        <span className="text-xs font-medium text-primary">{t('versionUpdate.latestVersion')}</span>
                        <span className="font-mono text-xs text-primary">{latestVersion}</span>
                    </div>
                </div>

                {/* Changelog */}
                {releaseInfo?.body && (
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('versionUpdate.whatsNew')}</h3>
                            {releaseInfo?.htmlUrl && (
                                <a
                                    href={releaseInfo.htmlUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1 text-xs text-primary transition-colors hover:underline"
                                >
                                    {t('versionUpdate.viewFullRelease')}
                                    <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                    </svg>
                                </a>
                            )}
                        </div>
                        <div className="max-h-64 overflow-y-auto rounded-md border border-border/60 bg-muted/30 p-4">
                            <div className="prose prose-sm max-w-none whitespace-pre-wrap text-xs text-foreground/90 dark:prose-invert">
                                {cleanChangelog(releaseInfo.body)}
                            </div>
                        </div>
                    </div>
                )}

                {/* Forked-build notice — auto-update is disabled to protect local customizations */}
                <div className="rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                    Auto-update er deaktiveret i denne build. Kør <code className="rounded bg-background/60 px-1.5 py-0.5 font-mono text-foreground">bash /home/claude/cloudcli-fork/update.sh</code> i terminalen for at hente upstream-ændringer og bygge fra fork.
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-2">
                    <button
                        onClick={onClose}
                        className="flex-1 rounded-md border border-border bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground transition-colors hover:bg-accent"
                    >
                        {t('versionUpdate.buttons.close')}
                    </button>
                </div>
            </div>
        </div>
    );
};

// Clean up changelog by removing GitHub-specific metadata
const cleanChangelog = (body: string) => {
    if (!body) return '';

    return body
        // Remove full commit hashes (40 character hex strings)
        .replace(/\b[0-9a-f]{40}\b/gi, '')
        // Remove short commit hashes (7-10 character hex strings at start of line or after dash/space)
        .replace(/(?:^|\s|-)([0-9a-f]{7,10})\b/gi, '')
        // Remove "Full Changelog" links
        .replace(/\*\*Full Changelog\*\*:.*$/gim, '')
        // Remove compare links (e.g., https://github.com/.../compare/v1.0.0...v1.0.1)
        .replace(/https?:\/\/github\.com\/[^\/]+\/[^\/]+\/compare\/[^\s)]+/gi, '')
        // Clean up multiple consecutive empty lines
        .replace(/\n\s*\n\s*\n/g, '\n\n')
        // Trim whitespace
        .trim();
};
