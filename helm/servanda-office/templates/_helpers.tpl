{{/*
Expand the name of the chart.
*/}}
{{- define "servanda-office.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this.
*/}}
{{- define "servanda-office.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "servanda-office.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "servanda-office.labels" -}}
helm.sh/chart: {{ include "servanda-office.chart" . }}
{{ include "servanda-office.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: servanda-office
{{- with .Values.global.labels }}
{{ toYaml . }}
{{- end }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "servanda-office.selectorLabels" -}}
app.kubernetes.io/name: {{ include "servanda-office.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
API component labels
*/}}
{{- define "servanda-office.api.labels" -}}
{{ include "servanda-office.labels" . }}
app.kubernetes.io/component: api
{{- end }}

{{/*
API selector labels
*/}}
{{- define "servanda-office.api.selectorLabels" -}}
{{ include "servanda-office.selectorLabels" . }}
app.kubernetes.io/component: api
{{- end }}

{{/*
Web component labels
*/}}
{{- define "servanda-office.web.labels" -}}
{{ include "servanda-office.labels" . }}
app.kubernetes.io/component: web
{{- end }}

{{/*
Web selector labels
*/}}
{{- define "servanda-office.web.selectorLabels" -}}
{{ include "servanda-office.selectorLabels" . }}
app.kubernetes.io/component: web
{{- end }}

{{/*
Export Worker component labels
*/}}
{{- define "servanda-office.exportWorker.labels" -}}
{{ include "servanda-office.labels" . }}
app.kubernetes.io/component: export-worker
{{- end }}

{{/*
Export Worker selector labels
*/}}
{{- define "servanda-office.exportWorker.selectorLabels" -}}
{{ include "servanda-office.selectorLabels" . }}
app.kubernetes.io/component: export-worker
{{- end }}

{{/*
Image helper — resolves tag with global fallback
*/}}
{{- define "servanda-office.api.image" -}}
{{- $tag := default .Values.global.imageTag .Values.api.image.tag -}}
{{- printf "%s:%s" .Values.api.image.repository $tag -}}
{{- end }}

{{- define "servanda-office.web.image" -}}
{{- $tag := default .Values.global.imageTag .Values.web.image.tag -}}
{{- printf "%s:%s" .Values.web.image.repository $tag -}}
{{- end }}

{{- define "servanda-office.exportWorker.image" -}}
{{- $tag := default .Values.global.imageTag .Values.exportWorker.image.tag -}}
{{- printf "%s:%s" .Values.exportWorker.image.repository $tag -}}
{{- end }}

{{/*
Image pull policy helper — resolves with global fallback
*/}}
{{- define "servanda-office.api.imagePullPolicy" -}}
{{- default .Values.global.imagePullPolicy .Values.api.image.pullPolicy -}}
{{- end }}

{{- define "servanda-office.web.imagePullPolicy" -}}
{{- default .Values.global.imagePullPolicy .Values.web.image.pullPolicy -}}
{{- end }}

{{- define "servanda-office.exportWorker.imagePullPolicy" -}}
{{- default .Values.global.imagePullPolicy .Values.exportWorker.image.pullPolicy -}}
{{- end }}

{{/*
Namespace helper
*/}}
{{- define "servanda-office.namespace" -}}
{{- default .Release.Namespace .Values.global.namespace -}}
{{- end }}

{{/*
Secret name helpers
*/}}
{{- define "servanda-office.secretName.db" -}}
{{- printf "%s-db-credentials" (include "servanda-office.fullname" .) -}}
{{- end }}

{{- define "servanda-office.secretName.s3" -}}
{{- printf "%s-s3-credentials" (include "servanda-office.fullname" .) -}}
{{- end }}

{{- define "servanda-office.secretName.oidc" -}}
{{- printf "%s-oidc-credentials" (include "servanda-office.fullname" .) -}}
{{- end }}

{{/*
ConfigMap name helper
*/}}
{{- define "servanda-office.configMapName" -}}
{{- printf "%s-config" (include "servanda-office.fullname" .) -}}
{{- end }}
