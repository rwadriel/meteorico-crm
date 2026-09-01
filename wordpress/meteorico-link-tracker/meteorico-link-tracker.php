<?php
/**
 * Plugin Name: Meteórico Link Tracker
 * Description: Mantém musicalucrativa.com.br visível nos links do WhatsApp e registra os cliques no CRM.
 * Version: 1.0.0
 * Author: Música Lucrativa
 */

if (!defined('ABSPATH')) {
    exit;
}

const METEORICO_TRACKER_COLLECTOR = 'https://meteorico.musicalucrativa.com.br/api/t/';

function meteorico_tracker_add_rewrite_rule(): void
{
    add_rewrite_rule(
        '^r/([A-Za-z0-9_-]{16,32})/?$',
        'index.php?meteorico_tracking_code=$matches[1]',
        'top'
    );
}
add_action('init', 'meteorico_tracker_add_rewrite_rule');

function meteorico_tracker_query_vars(array $vars): array
{
    $vars[] = 'meteorico_tracking_code';
    return $vars;
}
add_filter('query_vars', 'meteorico_tracker_query_vars');

function meteorico_tracker_activate(): void
{
    meteorico_tracker_add_rewrite_rule();
    flush_rewrite_rules();
}
register_activation_hook(__FILE__, 'meteorico_tracker_activate');

function meteorico_tracker_deactivate(): void
{
    flush_rewrite_rules();
}
register_deactivation_hook(__FILE__, 'meteorico_tracker_deactivate');

function meteorico_tracker_redirect(): void
{
    $code = (string) get_query_var('meteorico_tracking_code');
    if ($code === '') {
        return;
    }
    if (!preg_match('/^[A-Za-z0-9_-]{16,32}$/', $code)) {
        status_header(404);
        exit;
    }

    $headers = array(
        'User-Agent' => isset($_SERVER['HTTP_USER_AGENT'])
            ? sanitize_text_field(wp_unslash($_SERVER['HTTP_USER_AGENT']))
            : 'Meteorico-WordPress-Tracker/1.0',
        'Referer' => isset($_SERVER['HTTP_REFERER'])
            ? esc_url_raw(wp_unslash($_SERVER['HTTP_REFERER']))
            : '',
    );
    $response = wp_remote_get(METEORICO_TRACKER_COLLECTOR . rawurlencode($code), array(
        'timeout' => 8,
        'redirection' => 0,
        'headers' => $headers,
    ));

    if (is_wp_error($response)) {
        wp_safe_redirect(home_url('/'), 302, 'Meteórico Link Tracker');
        exit;
    }
    $status = (int) wp_remote_retrieve_response_code($response);
    $destination = wp_remote_retrieve_header($response, 'location');
    if ($status >= 300 && $status < 400 && is_string($destination)) {
        $destination = esc_url_raw($destination, array('https'));
        if ($destination !== '') {
            wp_redirect($destination, 302, 'Meteórico Link Tracker');
            exit;
        }
    }

    wp_safe_redirect(home_url('/'), 302, 'Meteórico Link Tracker');
    exit;
}
add_action('template_redirect', 'meteorico_tracker_redirect');
