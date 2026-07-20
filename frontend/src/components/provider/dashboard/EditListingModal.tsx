import React, { useState } from 'react';
import { X, Upload } from 'lucide-react';
import api from '@/lib/api';
import { uploadImage, uploadImages } from '@/lib/uploadImage';
import { VEHICLE_TYPES, HOMESTAY_AMENITIES, HOMESTAY_TAGS } from '@/constants/listingOptions';
import ChipToggleGroup, { toggleIn } from '../ChipToggleGroup';
import AmenityPicker from '../AmenityPicker';
import AvatarUploader from '../AvatarUploader';
import GalleryUploader from '../GalleryUploader';
import { RouteListEditor } from '../RouteEditor';

/** Dashboard modal to edit a live listing's details, images, and extras. */
export default function EditListingModal({ listing, onClose, onSave }: {
  listing: any;
  onClose: () => void;
  onSave: () => void;
}) {
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
  const [vehicleType, setVehicleType] = useState(listing.extras?.vehicle_type || '');
  const [routes, setRoutes] = useState<string[]>(listing.extras?.routes || []);

  const uploadOne = async (
    e: React.ChangeEvent<HTMLInputElement>,
    setFlag: (b: boolean) => void,
    apply: (url: string) => void,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
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
            vehicle_type: vehicleType,
            routes,
          }
        : {
            ...listing.extras,
            images: gallery,
            host_name: hostName,
            host_bio: hostBio,
            host_avatar: hostAvatar,
            address,
            amenities: selectedAmenities,
            tags: selectedTags,
          };

      await api.put(`/listings/${listing.id}`, {
        title,
        price: Number(price),
        location,
        description,
        image,
        tags: isDriver ? [] : selectedTags,
        extras: extrasPayload,
      });
      onSave();
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm grid place-items-center p-4 overflow-y-auto" data-testid="edit-listing-modal">
      <div className="bg-white rounded-3xl w-full max-w-2xl border border-[var(--line)] overflow-hidden shadow-2xl animate-fade-up">
        {/* Header */}
        <div className="flex justify-between items-center px-6 py-5 border-b border-[var(--line)]">
          <h2 className="font-display font-extrabold text-2xl text-ink">Edit Listing Details & Images</h2>
          <button type="button" onClick={onClose} className="p-1 rounded-full hover:bg-mist text-ink-soft transition-colors" data-testid="close-edit-modal">
            <X size={20} />
          </button>
        </div>

        {/* Scrollable Form */}
        <form onSubmit={handleSave} className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          <div className="grid md:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-xs font-semibold text-ink-soft">Title</span>
              <input required type="text" value={title} onChange={(e) => setTitle(e.target.value)}
                className="mt-1 w-full px-3.5 py-2.5 rounded-xl border border-[var(--line)] bg-white outline-none text-sm text-ink font-semibold" />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-ink-soft">Price (₹ starting from)</span>
              <input required type="number" min="0" value={price} onChange={(e) => setPrice(Number(e.target.value) || 0)}
                className="mt-1 w-full px-3.5 py-2.5 rounded-xl border border-[var(--line)] bg-white outline-none text-sm text-ink font-semibold" />
            </label>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-xs font-semibold text-ink-soft">Location</span>
              <input required type="text" value={location} onChange={(e) => setLocation(e.target.value)}
                className="mt-1 w-full px-3.5 py-2.5 rounded-xl border border-[var(--line)] bg-white outline-none text-sm text-ink font-semibold" />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-ink-soft">Full Address</span>
              <input type="text" value={address} onChange={(e) => setAddress(e.target.value)}
                placeholder="e.g. 15 Gandhi Road"
                className="mt-1 w-full px-3.5 py-2.5 rounded-xl border border-[var(--line)] bg-white outline-none text-sm text-ink font-semibold" />
            </label>
          </div>

          <label className="block">
            <span className="text-xs font-semibold text-ink-soft">{isDriver ? 'Driver Bio / About' : 'Description'}</span>
            <textarea required value={description} onChange={(e) => setDescription(e.target.value)} rows={4}
              className="mt-1 w-full px-3.5 py-2.5 rounded-xl border border-[var(--line)] bg-white outline-none text-sm text-ink" />
          </label>

          {/* ===== DRIVER-SPECIFIC FIELDS ===== */}
          {isDriver && (
            <>
              <div>
                <span className="text-xs font-semibold text-ink-soft uppercase block mb-2">Vehicle Type</span>
                <ChipToggleGroup
                  options={VEHICLE_TYPES}
                  selected={vehicleType ? [vehicleType] : []}
                  onToggle={setVehicleType}
                />
              </div>

              <div className="border-t border-[var(--line)] pt-5">
                <span className="text-xs font-extrabold uppercase tracking-widest text-ink-soft block mb-3">Driver Photo</span>
                <AvatarUploader
                  src={driverAvatar}
                  initial={title || 'D'}
                  size="sm"
                  uploading={uploadingDriverPic}
                  onFileSelected={(e) => uploadOne(e, setUploadingDriverPic, setDriverAvatar)}
                  label="Upload Driver Photo"
                />
              </div>

              <div className="border-t border-[var(--line)] pt-5">
                <span className="text-xs font-extrabold uppercase tracking-widest text-ink-soft block mb-1">Routes Covered</span>
                <p className="text-xs text-ink-soft mb-3">List the trips and routes you operate. These appear on your public listing page.</p>
                <RouteListEditor routes={routes} onChange={setRoutes} compact />
              </div>
            </>
          )}

          {isHomestay && (
            <div className="pt-2">
              <span className="text-xs font-semibold text-ink-soft uppercase block mb-2">Listing Tags</span>
              <ChipToggleGroup
                options={HOMESTAY_TAGS}
                selected={selectedTags}
                onToggle={(tag) => setSelectedTags((prev) => toggleIn(prev, tag))}
              />
            </div>
          )}

          {/* Hero Image Section */}
          <div className="border-t border-[var(--line)] pt-5">
            <span className="text-xs font-extrabold uppercase tracking-widest text-ink-soft block mb-3">Main Cover Image</span>
            <div className="flex flex-col md:flex-row gap-4 items-start">
              <div className="w-full md:w-48 h-32 rounded-xl bg-mist overflow-hidden border border-[var(--line)] flex-shrink-0 relative">
                {image ? (
                  <img src={image} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full grid place-items-center text-xs text-ink-soft">No Cover Image</div>
                )}
                {uploading && <div className="absolute inset-0 bg-black/40 grid place-items-center text-xs text-white">Uploading...</div>}
              </div>
              <div className="flex-1">
                <p className="text-xs text-ink-soft mb-3">This is the large cover background image shown at the top of your details page.</p>
                <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-white border border-[var(--line)] text-ink font-bold text-xs btn-hover cursor-pointer">
                  <Upload size={14} /> Choose Cover Image
                  <input type="file" accept="image/*" onChange={(e) => uploadOne(e, setUploading, setImage)} className="hidden" />
                </label>
              </div>
            </div>
          </div>

          {/* Gallery Images Section */}
          <div className="border-t border-[var(--line)] pt-5">
            <span className="text-xs font-extrabold uppercase tracking-widest text-ink-soft block mb-1">Photo Gallery</span>
            <p className="text-xs text-ink-soft mb-4">Add photos of your rooms, bathrooms, surroundings, and amenities. These will render as a beautiful gallery inside your public listing page.</p>
            <GalleryUploader
              images={gallery}
              uploading={uploading}
              onFilesSelected={handleAddGalleryImages}
              onRemove={(i) => setGallery((prev) => prev.filter((_, idx) => idx !== i))}
              compact
            />
          </div>

          {/* Amenities Section */}
          {isHomestay && (
            <div className="border-t border-[var(--line)] pt-5 space-y-4">
              <span className="text-xs font-extrabold uppercase tracking-widest text-ink-soft block mb-1">What this place offers (Amenities)</span>
              <AmenityPicker
                presets={HOMESTAY_AMENITIES}
                selected={selectedAmenities}
                onChange={setSelectedAmenities}
                compact
              />
            </div>
          )}

          {/* Host Settings */}
          {isHomestay && (
            <div className="border-t border-[var(--line)] pt-5 space-y-4">
              <span className="text-xs font-extrabold uppercase tracking-widest text-ink-soft block mb-1">Host Information</span>

              <div className="flex flex-col md:flex-row gap-4 items-start">
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-pine to-pine-dark text-white overflow-hidden shadow-md flex items-center justify-center font-display font-extrabold text-2xl flex-shrink-0 relative">
                  {hostAvatar ? (
                    <img src={hostAvatar} alt="" className="w-full h-full object-cover" />
                  ) : (
                    (hostName || 'Host').charAt(0).toUpperCase()
                  )}
                  {uploadingHostPic && <div className="absolute inset-0 bg-black/40 grid place-items-center text-[10px] text-white">...</div>}
                </div>
                <div className="flex-1 space-y-3 w-full">
                  <label className="block">
                    <span className="text-xs font-semibold text-ink-soft">Host Name</span>
                    <input type="text" value={hostName} onChange={(e) => setHostName(e.target.value)}
                      className="mt-1 w-full px-3 py-2 rounded-xl border border-[var(--line)] bg-white outline-none text-sm font-semibold text-ink" />
                  </label>

                  <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-[var(--line)] text-ink font-bold text-xs btn-hover cursor-pointer">
                    <Upload size={12} /> {uploadingHostPic ? 'Uploading...' : 'Upload Host Photo'}
                    <input type="file" accept="image/*" onChange={(e) => uploadOne(e, setUploadingHostPic, setHostAvatar)} className="hidden" />
                  </label>
                </div>
              </div>

              <label className="block">
                <span className="text-xs font-semibold text-ink-soft">Host Bio</span>
                <textarea rows={3} value={hostBio} onChange={(e) => setHostBio(e.target.value)}
                  className="mt-1 w-full px-3.5 py-2.5 rounded-xl border border-[var(--line)] bg-white outline-none text-sm text-ink leading-relaxed" />
              </label>
            </div>
          )}

          {error && (
            <div className="p-3 bg-flag/10 border border-flag/20 rounded-xl text-xs text-flag font-semibold text-center animate-pulse">
              {error}
            </div>
          )}

          {/* Footer */}
          <div className="border-t border-[var(--line)] pt-5 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-full border border-[var(--line)] text-ink font-bold text-sm btn-hover"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || uploading}
              data-testid="save-edit-listing"
              className="px-6 py-2.5 rounded-full bg-flag text-white font-bold text-sm btn-hover disabled:opacity-60"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
