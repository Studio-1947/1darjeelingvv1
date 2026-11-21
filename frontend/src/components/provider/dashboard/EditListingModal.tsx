import React, { useState } from 'react';
import { MAX_PRICE } from '@/lib/hostFormChecks';
import { useTranslation } from 'react-i18next';
import { Upload } from '@phosphor-icons/react';
import { Button, FieldError, TextArea, TextField } from '@/components/ag';
import { Sheet } from './widgets';
import api from '@/lib/api';
import { uploadImage, uploadImages } from '@/lib/uploadImage';
import { VEHICLE_TYPES, HOMESTAY_AMENITIES, HOMESTAY_TAGS } from '@/constants/listingOptions';
import ChipToggleGroup, { toggleIn } from '../ChipToggleGroup';
import AmenityPicker from '../AmenityPicker';
import AvatarUploader from '../AvatarUploader';
import GalleryUploader from '../GalleryUploader';
import { RouteListEditor, RouteFareTable } from '../RouteEditor';
import { normalizeRoutes, startingPriceFrom } from '@/lib/routeFares';

/** Dashboard modal to edit a live listing's details, images, and extras. */
export default function EditListingModal({ listing, onClose, onSave }: {
  listing: any;
  onClose: () => void;
  onSave: () => void;
}) {
  const { t } = useTranslation();
  const isHomestay = listing.type === 'homestay';
  const isDriver = listing.type === 'driver';

  const [title, setTitle] = useState(listing.title || '');
  const [price, setPrice] = useState(listing.price || 0);
  const [location, setLocation] = useState(listing.location || '');
  const [description, setDescription] = useState(listing.description || '');
  const [image, setImage] = useState(listing.image || '');
  const [gallery, setGallery] = useState<string[]>(listing.extras?.images || []);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Homestay-specific
  const [hostName, setHostName] = useState(listing.extras?.host_name || '');
  const [hostBio, setHostBio] = useState(listing.extras?.host_bio || '');
  const [hostAvatar, setHostAvatar] = useState(listing.extras?.host_avatar || '');
  const [uploadingHostPic, setUploadingHostPic] = useState(false);
  const [address, setAddress] = useState(listing.extras?.address || '');
  const [selectedAmenities, setSelectedAmenities] = useState<string[]>(listing.extras?.amenities || []);
  const [selectedTags, setSelectedTags] = useState<string[]>(listing.tags || listing.extras?.tags || []);

  // Driver-specific
  const [driverAvatar, setDriverAvatar] = useState(listing.extras?.host_avatar || '');
  const [uploadingDriverPic, setUploadingDriverPic] = useState(false);
  const [carModel, setCarModel] = useState(listing.extras?.car_model || '');
  const [gender, setGender] = useState<'male' | 'female' | 'other'>(listing.extras?.gender || 'male');
  const [vehicleType, setVehicleType] = useState(listing.extras?.vehicle_type || '');
  // Legacy listings stored routes as bare strings; normalize so old rows load
  // with an unpriced fare row rather than breaking the editor.
  const [routes, setRoutes] = useState(() => normalizeRoutes(listing.extras?.routes));

  const uploadOne = async (
    e: React.ChangeEvent<HTMLInputElement>,
    setFlag: (b: boolean) => void,
    apply: (url: string) => void,
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) await uploadFileOne(file, setFlag, apply);
  };
  const uploadFileOne = async (file: File, setFlag: (b: boolean) => void, apply: (url: string) => void) => {
    setFlag(true);
    setError('');
    try {
      apply(await uploadImage(file));
    } catch (err: any) {
      setError(err);
    } finally {
      setFlag(false);
    }
  };

  const handleAddGalleryImages = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    setError('');
    try {
      const urls = await uploadImages(files);
      setGallery((prev) => [...prev, ...urls]);
    } catch (err: any) {
      setError(err);
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const extrasPayload = isDriver
        ? {
          ...listing.extras,
          images: gallery,
          host_avatar: driverAvatar,
          car_model: carModel,
          gender,
          vehicle_type: vehicleType,
          routes,
        }
        : {
          ...listing.extras,
          images: gallery,
          host_name: hostName,
          host_bio: hostBio,
          host_avatar: hostAvatar,
          gender,
          address,
          amenities: selectedAmenities,
          tags: selectedTags,
        };

      // A driver's headline price tracks their cheapest route, so it can't drift
      // from the per-route fares. Other types keep the manual price field.
      const routeStart = startingPriceFrom(routes);
      await api.put(`/listings/${listing.id}`, {
        title,
        price: isDriver && routeStart > 0 ? routeStart : Number(price),
        location,
        description,
        image,
        tags: isDriver ? [] : selectedTags,
        extras: extrasPayload,
      });
      onSave();
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.detail || t('common.save_failed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet title={t('el.title')} onClose={onClose} closeTestId="close-edit-modal" testId="edit-listing-modal">
      <form onSubmit={handleSave} className="grid gap-4 p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label={t('lf.title')} required value={title} onChange={(e) => setTitle(e.target.value)} />
          {/* Drivers don't get a single price - theirs is derived from the cheapest route rate
              below, so an editable field here would just be a second, losing source of truth. */}
          {isDriver ? (
            <div className="ag-field">
              <span>{t('el.starting_price')}</span>
              <p className="ag-in flex items-center gap-1 bg-[var(--soft)]">
                {startingPriceFrom(routes) > 0 ? `₹${startingPriceFrom(routes)}` : ''}
                <span className="text-sm text-[var(--ink-muted)]">· {t('el.starting_price_note')}</span>
              </p>
            </div>
          ) : (
            <TextField label={t('el.price')} required type="number" min="0" max={MAX_PRICE} value={price} onChange={(e) => setPrice(Math.min(MAX_PRICE, Number(e.target.value) || 0))} />
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label={t('lf.location')} required value={location} onChange={(e) => setLocation(e.target.value)} />
          <TextField label={t('el.address')} value={address} onChange={(e) => setAddress(e.target.value)} placeholder={t('el.address_ph')} />
        </div>

        <TextArea label={isDriver ? t('el.driver_bio') : t('pd.description')} required rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />

        {isDriver && (
          <>
            <TextField label={t('el.car_model')} value={carModel} onChange={(e) => setCarModel(e.target.value)} placeholder={t('el.car_model_ph')} />
            <Part title={t('el.vehicle_type')}>
              <ChipToggleGroup options={VEHICLE_TYPES} selected={vehicleType ? [vehicleType] : []} onToggle={setVehicleType} />
            </Part>
            <Part title={t('el.driver_photo')}>
              <AvatarUploader src={driverAvatar} initial={title || 'D'} uploading={uploadingDriverPic}
                onFile={(f) => uploadFileOne(f, setUploadingDriverPic, setDriverAvatar)} onRemove={() => setDriverAvatar('')}
                label={t('el.upload_driver_photo')} />
            </Part>
            <Part title={t('el.routes_covered')} note={t('el.routes_note')}>
              <RouteListEditor routes={routes} onChange={setRoutes} />
            </Part>
            <Part title={t('el.route_rates')} note={t('el.route_rates_note')}>
              <RouteFareTable routes={routes} onChange={setRoutes} emptyNote={t('el.route_rates_empty')} />
            </Part>
          </>
        )}

        {isHomestay && (
          <Part title={t('el.listing_tags')}>
            <ChipToggleGroup options={HOMESTAY_TAGS} selected={selectedTags} onToggle={(tag) => setSelectedTags((prev) => toggleIn(prev, tag))} />
          </Part>
        )}

        <Part title={t('el.cover_image')} note={t('el.cover_note')}>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative aspect-[4/3] w-44 overflow-hidden rounded-[18px] border border-[var(--warmline)] bg-[var(--creme2)]">
              {image ? <img src={image} alt="" className="h-full w-full object-cover" /> : <span className="ag-small grid h-full place-items-center">{t('el.no_cover')}</span>}
              {uploading && <div className="absolute inset-0 grid place-items-center bg-black/40 text-xs text-white">{t('common.uploading')}</div>}
            </div>
            {/* A label styled as a small button, so the file picker opens from it. */}
            <label className="ag-btn sm cursor-pointer">
              <Upload />
              <span>{t('el.choose_cover')}</span>
              <input type="file" accept="image/*" onChange={(e) => uploadOne(e, setUploading, setImage)} className="sr-only" />
            </label>
          </div>
        </Part>

        <Part title={t('el.photo_gallery')} note={t('el.gallery_note')}>
          <GalleryUploader images={gallery} uploading={uploading} onFilesSelected={handleAddGalleryImages}
            onRemove={(i) => setGallery((prev) => prev.filter((_, idx) => idx !== i))} />
        </Part>

        {isHomestay && (
          <Part title={t('el.amenities')}>
            <AmenityPicker presets={HOMESTAY_AMENITIES} selected={selectedAmenities} onChange={setSelectedAmenities} />
          </Part>
        )}

        {isHomestay && (
          <Part title={t('el.host_info')}>
            <AvatarUploader src={hostAvatar} initial={hostName || 'Host'} uploading={uploadingHostPic}
              onFile={(f) => uploadFileOne(f, setUploadingHostPic, setHostAvatar)} onRemove={() => setHostAvatar('')}
              label={t('el.upload_host_photo')} />
            <TextField label={t('el.host_name')} value={hostName} onChange={(e) => setHostName(e.target.value)} />
            <TextArea label={t('el.host_bio')} rows={3} value={hostBio} onChange={(e) => setHostBio(e.target.value)} />
          </Part>
        )}

        <FieldError>{error}</FieldError>

        <div className="ag-row justify-end border-t border-[var(--hairline)] pt-4">
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" variant="primary" disabled={saving || uploading || uploadingHostPic || uploadingDriverPic} data-testid="save-edit-listing">
            {saving ? t('common.saving') : t('common.save_changes')}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}

/** One titled part of the edit form, separated by a hairline. */
function Part({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-2.5 border-t border-[var(--hairline)] pt-4">
      <div>
        <h3 className="m-0 text-base font-medium text-[var(--ink-strong)]">{title}</h3>
        {note && <p className="ag-small">{note}</p>}
      </div>
      {children}
    </section>
  );
}
