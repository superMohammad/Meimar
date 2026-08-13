/**
 * Arabic dictionary — the source of truth for the key set.
 *
 * City and district values are never translated. They arrive from the data in
 * Arabic and stay Arabic in every locale, because they are proper nouns.
 */

export const ar = {
  brand: "معمار",
  tagline: "محرك أسعار وذكاء موقعي للعقار السعودي",

  nav: {
    skipToContent: "تخطَّ إلى المحتوى",
    map: "الخريطة",
    estimate: "قدّر عقارك",
    districts: "الأحياء",
    methodology: "المنهجية",
    about: "عن معمار",
    contact: "تواصل معنا",
    privacy: "الخصوصية",
    terms: "الشروط",
    language: "English",
    menu: "القائمة",
  },

  landing: {
    headline: "اعرف سعر المتر قبل ما تفاوض",
    sub: "خريطة لكل عروض العقار في السعودية، مع تقدير سعر لكل عرض ومقارنة بالعروض المشابهة في نفس الحي.",
    openMap: "افتح الخريطة",
    tryEstimate: "قدّر عقارك",
    statListings: "عرض عقاري",
    statEstimates: "عرض له تقدير",
    statDistricts: "حي",
    statAccuracy: "متوسط خطأ التقدير",
    featureMapTitle: "خريطة أولًا",
    featureMapBody:
      "تصفّح العروض على صور أقمار صناعية، مع طبقة تُظهر سعر المتر في كل حي.",
    featureValueTitle: "تقدير السعر",
    featureValueBody:
      "لكل عرض بيع تقدير ونطاق متوقع، ومقارنة بالعروض المشابهة من نفس النوع في نفس الحي.",
    featureAreaTitle: "معلومات الأحياء",
    featureAreaBody:
      "متوسط الأسعار وعدد العروض والخدمات القريبة لكل حي، مبنية على العروض نفسها.",
    more: "اعرف أكثر",
    popularDistricts: "أكثر الأحياء عروضًا",
    allDistricts: "كل الأحياء",
    honestyTitle: "من وين تجي الأرقام؟",
    honestyBody:
      "كل الأسعار هنا أسعار طلب من المعلنين، مو أسعار صفقات مكتملة. التقدير نموذج مبني على أسعار الطلب نفسها، ومتوسط خطأه {pct} على بيانات لم يتدرب عليها. نقولها بصراحة عشان تعرف وش تقرأ.",
  },

  filters: {
    title: "تصفية",
    purpose: "الغرض",
    sell: "بيع",
    rental: "إيجار",
    estateType: "نوع العقار",
    priceRange: "نطاق السعر",
    areaRange: "المساحة",
    minBeds: "غرف النوم",
    city: "المدينة",
    district: "الحي",
    all: "الكل",
    reset: "إعادة تعيين",
    apply: "تطبيق",
    // The trigger shows a bare count badge; a screen reader needs the noun.
    activeCount: "{count} عوامل تصفية مفعّلة",
    close: "إغلاق التصفية",
    // Each half of a range needs its own name: two inputs under one visible
    // label leave the second one unannounced.
    min: "الحد الأدنى",
    max: "الحد الأعلى",
  },

  near: {
    title: "البحث حسب المسافة",
    pick: "حدد نقطة على الخريطة",
    picking: "اضغط على الخريطة لتحديد النقطة",
    cancel: "إلغاء",
    clear: "إزالة النقطة",
    radius: "ضمن",
    // Said plainly: this is a straight line on a map, not a drive. Nothing in
    // the product knows about roads or traffic.
    note: "المسافة بخط مستقيم، وليست زمن تنقل.",
    active: "ضمن {km} كم من النقطة المحددة",
  },

  estateTypes: {
    land: "أرض",
    villa: "فيلا",
    apartment: "شقة",
    building: "عمارة",
    floor: "دور",
    store: "محل",
    esterahah: "استراحة",
    room: "غرفة",
    office: "مكتب",
    house: "بيت",
    farm: "مزرعة",
    warehouse: "مستودع",
    chalet: "شاليه",
    campsite: "مخيم",
    furnished_apartment: "شقة مفروشة",
  },

  map: {
    loading: "جارٍ تحميل البيانات…",
    listingsInView: "عقار في النطاق",
    showingCapped: "يُعرض {shown} من {total} نتيجة",
    zoomForPins: "قرّب لعرض العقارات",
  },

  listing: {
    area: "المساحة",
    beds: "غرف النوم",
    livings: "الصالات",
    bathrooms: "دورات المياه",
    streetWidth: "عرض الشارع",
    age: "عمر العقار",
    years: "سنة",
    furnished: "مفروش",
    amenities: "المميزات",
    description: "الوصف",
    close: "إغلاق",
    noDescription: "لا يوجد وصف",
  },

  amenities: {
    f_ac: "مكيفات",
    f_parking: "موقف",
    f_pool: "مسبح",
    f_kitchen: "مطبخ",
    f_driver: "غرفة سائق",
    f_basement: "قبو",
    f_garden: "حديقة",
    f_two_entr: "مدخلين",
    f_corner: "زاوية",
    f_near_masjid: "قرب مسجد",
    f_investment: "استثماري",
    f_negotiable: "قابل للتفاوض",
    f_urgent: "بيع سريع",
    f_near_park: "قرب حديقة",
    f_yard: "حوش",
    f_new: "جديد",
  },

  services: {
    title: "الخدمات القريبة",
    radius: "نطاق البحث",
    facilities: "مرفق",
    disclaimer:
      "المسافات مقاسة إلى أقرب مرفق مسجَّل في OpenStreetMap. تُعرض فقط الفئات التي تكفي تغطيتها للاعتماد عليها.",
    categories: {
      mosque: "مسجد",
      hospital: "مستشفى/عيادة",
      mall: "مركز تسوق",
      university: "جامعة",
    },
  },

  valuation: {
    title: "تقدير السعر",
    estimate: "التقدير",
    asking: "السعر المعلن",
    range: "النطاق المتوقع",
    above: "أعلى من تقدير العروض المشابهة بـ {pct}",
    below: "أقل من تقدير العروض المشابهة بـ {pct}",
    inline: "قريب من تقدير العروض المشابهة",
    none: "لا يوجد تقدير",
    noneRental: "التقدير متاح لعروض البيع فقط.",
    noneOutOfRange: "سعر هذا العرض خارج النطاق الذي دُرِّب عليه النموذج.",
    // The single most important sentence in the product: the models are fitted
    // on advertised asking prices, so this is a comparison against what others
    // ask, not an appraisal of worth.
    basis:
      "تقدير مبني على أسعار العروض المشابهة، وليس تقييمًا للقيمة السوقية ولا سعر صفقة.",
    accuracy: "متوسط الخطأ {pct} على بيانات لم يتدرب عليها النموذج.",
    basedOn: "مبني على {count} عرضًا من نوع {type} في {district}",
    typicalRange: "سعر المتر المعتاد: {low} – {high} {unit}",
  },

  priceLayer: {
    title: "طبقات الخريطة",
    pricePerM2: "سعر المتر",
    off: "بدون طبقة",
    // The layer is unavailable rather than wrong when no type is chosen: a
    // district figure that mixes land with villas maps the listing mix.
    needsType: "اختر نوع العقار لعرض سعر المتر",
    legend: "ر.س/م²",
    noData: "لا توجد بيانات كافية",
  },

  listingPage: {
    permalink: "صفحة العرض",
    backToMap: "العودة للخريطة",
    notFound: "لم يُعثر على هذا العرض",
    loading: "جارٍ التحميل…",
  },

  estimate: {
    title: "قدّر سعر عقارك",
    subtitle: "أدخل تفاصيل العقار للحصول على تقدير مبني على العروض المشابهة",
    submit: "احسب التقدير",
    calculating: "جارٍ الحساب…",
    pickLocation: "حدد الموقع على الخريطة",
    locationHint: "اختياري — يضيف مؤشر الخدمات للموقع",
    result: "التقدير",
    unknownCity: "هذه المدينة غير موجودة في بيانات التدريب، والتقدير أقل موثوقية.",
    unknownDistrict: "هذا الحي غير موجود في بيانات التدريب، والتقدير أقل موثوقية.",
    error: "تعذّر حساب التقدير",
    // The service answers with a validation body or a connection error; both
    // used to reach the user as a raw status code and a slice of JSON.
    errorUnsupportedType: "النماذج تغطي العقارات المعروضة للبيع فقط، وهذا النوع ليس منها.",
    errorUnavailable: "خدمة التقدير غير متاحة حالياً. حاول مرة أخرى بعد قليل.",
    clearLocation: "إزالة الموقع",
  },

  district: {
    title: "عن الحي",
    listings: "عدد العروض",
    medianPrice: "متوسط السعر",
    medianPricePerM2: "متوسط سعر المتر",

    insufficient: "بيانات غير كافية",
    insufficientHint:
      "عدد العروض في هذا الحي أقل من أن يُبنى عليه متوسط موثوق.",
  },

  districtPage: {
    columnNote: "الأرقام متوسط سعر المتر (ر.س/م²) لكل أنواع العقار",
    searchLabel: "ابحث عن حي",
    searchPlaceholder: "اكتب اسم الحي أو المدينة…",
    resultCount: "{count} حي",
    noResults: "ما لقينا حي بهذا الاسم.",
    lede: "{count} عرض عقاري في {district}، {city}.",
    metaDescription: "أسعار العقار في {district} بـ{city}: متوسط السعر وسعر المتر من {count} عرضًا.",
    mixedTypes:
      "هذه المتوسطات تشمل كل أنواع العقار في الحي. سعر متر الأرض يختلف كثيرًا عن الفيلا أو الشقة — استخدم طبقة سعر المتر في الخريطة مع تحديد النوع.",
    exploreTitle: "شوف العروض على الخريطة",
    exploreBody: "افتح الخريطة وقرّب على الحي لتشوف العروض وأسعارها وتقديراتها.",
    indexLede: "كل الأحياء التي فيها عروض كافية لاستخراج متوسطات موثوقة، مرتبة حسب المدينة.",
  },

  pages: {
    about: {
      title: "عن معمار",
      lede: "معمار محرك أسعار وذكاء موقعي للعقار السعودي، وليس لوحة إعلانات.",
      whatTitle: "وش نسوي",
      whatBody: [
        "نجمع عروض العقار المعلنة في السعودية، ونعرضها على خريطة، ونضيف طبقة ما تلقاها في المنصات الثانية: تقدير سعر لكل عرض، ومقارنة بالعروض المشابهة في نفس الحي ومن نفس النوع.",
        "الفكرة بسيطة: المعلن يكتب السعر اللي يبيه. إحنا نقول لك كم يطلبون على عقار مشابه في نفس الحي، عشان تعرف موقع هذا السعر من السوق.",
      ],
      whyTitle: "ليش الصراحة مهمة هنا",
      whyBody: [
        "أي منصة تقدر تعرض رقم وتقول إنه «القيمة». إحنا نفضّل نقول من وين جاء الرقم وكم نسبة خطئه، لأن قرار شراء عقار أكبر من إنه يُبنى على رقم مجهول المصدر.",
      ],
    },
    contact: {
      title: "تواصل معنا",
      lede: "ملاحظة على رقم؟ عرض بياناته غلط؟ نبي نسمع.",
      dataTitle: "تصحيح بيانات",
      dataBody: [
        "إذا لقيت عرضًا بيانات موقعه أو سعره غير صحيحة، أرسل لنا رابط العرض ووش الغلط فيه.",
      ],
      generalTitle: "استفسارات عامة",
      generalBody: ["للأسئلة عن المنهجية أو الشراكات، تواصل معنا عبر البريد."],
    },
    methodology: {
      title: "المنهجية",
      lede: "من وين تجي كل الأرقام في معمار، ووش حدودها.",
      pricesTitle: "الأسعار أسعار طلب",
      pricesBody: [
        "كل سعر في المنصة هو السعر اللي كتبه المعلن، مو سعر صفقة مكتملة. ما عندنا وصول لأسعار الصفقات الفعلية، ونقولها بدل ما نلمّح إن الرقم أدق مما هو عليه.",
        "معناها إن التقدير يجاوب على سؤال: «كم يطلبون على عقار مشابه؟» — مو «كم يسوى هذا العقار؟».",
      ],
      modelTitle: "كيف يُحسب التقدير",
      modelBody: [
        "نموذجان منفصلان: واحد للعقارات المبنية للبيع يتوقع السعر الكلي، وواحد للأراضي يتوقع سعر المتر ثم يُضرب في المساحة. فصلناهما لأن الأرض تُسعّر بالمتر والفيلا تُسعّر ككل.",
        "كل تقدير معروض على عرض قائم محسوب بطريقة out-of-fold: النموذج الذي تنبأ بالعرض لم يتدرب عليه. بدون هذا كان التقدير سيبدو أقرب للسعر المعلن مما يستحق، لأن النموذج ببساطة يتذكر العرض.",
        "متوسط الخطأ {builtPct} للعقارات المبنية و{landPct} للأراضي، مقيسًا على بيانات لم يتدرب عليها. لذلك نعرض نطاقًا دائمًا وليس رقمًا واحدًا.",
      ],
      servicesTitle: "الخدمات القريبة",
      servicesBody: [
        "المسافات مقاسة إلى الشكل الفعلي للمرفق في OpenStreetMap — إلى حافة الحديقة أو المستشفى، لا إلى مركزها.",
        "نعرض أربع فئات فقط: مسجد، مستشفى/عيادة، مركز تسوق، جامعة. قِسنا بقية الفئات ووجدنا تغطية OpenStreetMap فيها ضعيفة بثلاثة إلى أربعة أضعاف الواقع — المدارس والبقالات والحدائق تحديدًا. حذفناها بدل عرض أرقام نعرف أنها خاطئة.",
        "هذا يعني أن أهم الخدمات اليومية غير معروضة حاليًا. إصلاحها يحتاج مصدر بيانات أفضل، لا كودًا إضافيًا.",
      ],
      districtsTitle: "حدود الأحياء",
      districtsBody: [
        "حدود الأحياء على الخريطة مستخرجة من مواقع العروض نفسها، لأن حدود OpenStreetMap لا تغطي الأحياء السعودية. هي تقريب لمكان العروض، وليست حدودًا بلدية رسمية.",
      ],
    },
    privacy: {
      title: "سياسة الخصوصية",
      lede: "كيف نتعامل مع بياناتك.",
      notice:
        "هذه المسودة هيكلية. النص النهائي المتوافق مع نظام حماية البيانات الشخصية السعودي (PDPL) وآليات الموافقة ستُضاف في المرحلة القادمة قبل جمع أي بيانات شخصية.",
      collectTitle: "ما نجمعه اليوم",
      collectBody: [
        "المنصة حاليًا للتصفح فقط: لا حسابات، ولا تسجيل دخول، ولا جمع بيانات شخصية. بيانات العروض المعروضة إعلانات عامة.",
      ],
      futureTitle: "ما نخطط له",
      futureBody: [
        "نخطط لاحقًا لجمع بيانات استخدام لتحسين الترشيحات ولأغراض إعلانية. لن يبدأ ذلك قبل إضافة آلية موافقة صريحة يمكنك رفضها أو سحبها، بما يتوافق مع PDPL.",
      ],
    },
    terms: {
      title: "شروط الاستخدام",
      lede: "شروط استخدام معمار.",
      notice: "هذه المسودة هيكلية وستُراجع قانونيًا قبل الإطلاق.",
      useTitle: "طبيعة المعلومات",
      useBody: [
        "المعلومات في معمار لأغراض إرشادية فقط، وليست تقييمًا عقاريًا معتمدًا ولا نصيحة استثمارية. التقديرات مبنية على أسعار طلب معلنة وقد تختلف كثيرًا عن قيمة السوق.",
        "قبل أي قرار شراء أو بيع، راجع مُقيّمًا عقاريًا معتمدًا.",
      ],
      contentTitle: "محتوى الإعلانات",
      contentBody: [
        "بيانات العروض مصدرها إعلانات منشورة من أطراف ثالثة. لا نضمن دقتها أو توفر العقار أو صحة سعره.",
      ],
    },
  },

  units: {
    sar: "ر.س",
    sqm: "م²",
    sarPerSqm: "ر.س/م²",
    m: "م",
    km: "كم",
    // Stated once above a legend so its bands can be bare numbers. Repeating
    // "ألف" ten times across five columns is what made the old legend collide
    // with itself.
    thousands: "بالآلاف",
    millions: "بالملايين",
  },

  disclaimer:
    "الأسعار المعروضة هي أسعار طلب المعلنين، وليست أسعار صفقات مكتملة.",
};

/**
 * Structure of a locale dictionary, widened to `string` at the leaves.
 *
 * Deliberately not `as const`: with literal types every English string would
 * have to equal its Arabic counterpart to typecheck. Widening keeps the key
 * set enforced while letting the values differ.
 */
export type Dictionary = typeof ar;
