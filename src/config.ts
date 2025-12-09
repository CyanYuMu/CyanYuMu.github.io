import type {
	ExpressiveCodeConfig,
	LicenseConfig,
	NavBarConfig,
	ProfileConfig,
	SiteConfig,
} from "./types/config";
import { LinkPreset } from "./types/config";

export const siteConfig: SiteConfig = {
	title: "YuMu Blog",
	subtitle: "博客",
	keywords: ["Yumu", "博客", "学习", "日常"],
	lang: "zh_CN",
	translate: {
		enable: true,
		service: "client.edge",
		defaultLanguage: "zh-CN",
		autoDiscriminate: true,
		ignoreClasses: ["ignore"],
		ignoreTags: ["script", "style", "code", "pre"],
	},
	themeColor: {
		hue: 340,
		fixed: false,
	},
	defaultTheme: "system",
	wallpaper: {
		mode: "banner",
		src: {
			desktop: ["assets/images/mono1.png"],
			mobile: ["assets/images/mono1.png"],
		},
		position: "center",
		carousel: {
			enable: false,
			interval: 6,
		},
		banner: {
			homeText: {
				enable: true,
				title: "YuMu的小站",
				subtitle: ["『约定还在』", "『敬请期待』"],
				typewriter: {
					enable: true,
					speed: 110,
					deleteSpeed: 55,
					pauseTime: 2400,
				},
			},
			credit: {
				enable: false,
				text: "",
				url: "",
			},
			navbar: {
				transparentMode: "semifull",
			},
		},
		fullscreen: {
			zIndex: -1,
			opacity: 0.85,
			blur: 1.5,
			navbar: {
				transparentMode: "semi",
			},
		},
	},
	toc: {
		enable: true,
		depth: 2,
	},
	generateOgImages: false,
	favicon: [
		{
			src: "/favicon/favicon.jpg",
		},
	],
	showLastModified: true,
};

export const navBarConfig: NavBarConfig = {
	links: [
		LinkPreset.Home,
		LinkPreset.Archive,
		LinkPreset.Notes,
		LinkPreset.About,
		LinkPreset.Friends,
		{
			name: "GitHub",
			url: "https://github.com/CyanYuMu",
			external: true,
		},
	],
};

export const profileConfig: ProfileConfig = {
	avatar: "assets/images/avatar1.jpg",
	name: "CyanYuMu",
	bio: "想和你交流我学到的东西，分享下我的故事",
	links: [
		{
			name: "GitHub",
			icon: "fa6-brands:github",
			url: "https://github.com/CyanYuMu",
		},
		{
			name: "Mail",
			icon: "material-symbols:alternate-email",
			url: "mailto:CyanYuMu@outlook.com",
		},
	],
};

export const licenseConfig: LicenseConfig = {
	enable: true,
	name: "CC BY-NC-SA 4.0",
	url: "https://creativecommons.org/licenses/by-nc-sa/4.0/",
};

export const expressiveCodeConfig: ExpressiveCodeConfig = {
	theme: "github-dark",
};
